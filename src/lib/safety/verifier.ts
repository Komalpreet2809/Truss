import { detectDomain } from "@/lib/safety/domain";
import { countAstNodes, parseCandidate } from "@/lib/safety/parser";
import { synthesizeGrammar } from "@/lib/safety/policy";
import type {
  AstNode,
  ConstraintOutcome,
  DetectionResult,
  ParseArtifact,
  ProofArtifact,
  RefinementPlan,
  SafetyMode,
  SafetyVerdict,
  SourceLocation,
  VerificationInput,
  VerificationLogEntry,
  VerificationReport,
  VerificationTraceEntry,
} from "@/lib/safety/types";

const POLICY_VERSION = "0.2.0";

function firstEvidence(output: string, expressions: RegExp[]) {
  for (const expression of expressions) {
    const match = output.match(expression);

    if (match?.[0]) {
      return match[0];
    }
  }

  return undefined;
}

function hasAny(output: string, expressions: RegExp[]) {
  return expressions.some((expression) => expression.test(output));
}

function locateEvidence(output: string, evidence?: string): SourceLocation | undefined {
  if (!evidence) {
    return undefined;
  }

  const lines = output.replace(/\r\n/g, "\n").split("\n");
  const loweredEvidence = evidence.toLowerCase();

  for (const [index, line] of lines.entries()) {
    const loweredLine = line.toLowerCase();
    const matchIndex = loweredLine.indexOf(loweredEvidence);

    if (matchIndex >= 0) {
      return {
        line: index + 1,
        columnStart: matchIndex + 1,
        columnEnd: matchIndex + evidence.length,
        excerpt: line.trim() || line,
      };
    }
  }

  return undefined;
}

function findNodeId(
  node: AstNode,
  evidence: string | undefined,
  line: number | undefined,
): string | undefined {
  const loweredEvidence = evidence?.toLowerCase();
  const matchesLine = line === undefined || node.line === line;
  const matchesEvidence =
    loweredEvidence === undefined ||
    node.label.toLowerCase().includes(loweredEvidence) ||
    node.detail?.toLowerCase().includes(loweredEvidence);

  if (matchesLine && matchesEvidence) {
    return node.id;
  }

  for (const child of node.children) {
    const result = findNodeId(child, evidence, line);

    if (result) {
      return result;
    }
  }

  return undefined;
}

function makeConstraint(
  parseArtifact: ParseArtifact,
  output: string,
  constraint: Omit<ConstraintOutcome, "location" | "nodeId">,
): ConstraintOutcome {
  const location = locateEvidence(output, constraint.evidence);
  const nodeId = findNodeId(
    parseArtifact.root,
    constraint.evidence ?? constraint.token,
    location?.line,
  );

  return {
    ...constraint,
    location,
    nodeId,
  };
}

function shellConstraints(
  output: string,
  mode: SafetyMode,
  parseArtifact: ParseArtifact,
): ConstraintOutcome[] {
  const destructivePatterns = [
    /\brm\s+-rf\b/i,
    /\brmdir\b/i,
    /\bdel\s+\/f\b/i,
    /\bformat\b/i,
    /\bmkfs\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bdiskpart\b/i,
    /\bRemove-Item\b/i,
  ];
  const escalationPatterns = [/\bsudo\b/i, /\brunas\b/i, /\bSet-ExecutionPolicy\b/i];
  const remoteBootstrapPatterns = [
    /\bcurl\b.*\|\s*(sh|bash|zsh)/i,
    /\bwget\b.*\|\s*(sh|bash|zsh)/i,
    /\bInvoke-WebRequest\b.*iex/i,
  ];
  const chainingPatterns = [/(?:&&|\|\||;)/];
  const readonlyPatterns = [
    /\b(ls|dir|pwd|cat|type|echo|find|grep|Get-ChildItem|whoami|tasklist|ps)\b/i,
  ];

  return [
    makeConstraint(parseArtifact, output, {
      id: "phi1",
      title: "Destructive shell operations blocked",
      severity: "critical",
      passed: !hasAny(output, destructivePatterns),
      reason: hasAny(output, destructivePatterns)
        ? "The command includes a destructive primitive that could delete or reformat system resources."
        : "No destructive shell primitive was detected.",
      formula:
        "phi_1 := forall c in AST.Commands, destructive(c) = false",
      evidence: firstEvidence(output, destructivePatterns),
      token: "rm -rf",
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi2",
      title: "Privilege escalation blocked",
      severity: "high",
      passed: !hasAny(output, escalationPatterns),
      reason: hasAny(output, escalationPatterns)
        ? "The command attempts to gain elevated privileges."
        : "No privilege escalation sequence was detected.",
      formula:
        "phi_2 := forall t in AST.Tokens, t notin {sudo, runas, Set-ExecutionPolicy}",
      evidence: firstEvidence(output, escalationPatterns),
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi3",
      title: "Remote bootstrap pipelines blocked",
      severity: "high",
      passed: !hasAny(output, remoteBootstrapPatterns),
      reason: hasAny(output, remoteBootstrapPatterns)
        ? "The command streams a remote payload directly into a shell."
        : "No remote bootstrap pipeline was detected.",
      formula:
        "phi_3 := forall p in AST.Pipelines, remote_bootstrap(p) = false",
      evidence: firstEvidence(output, remoteBootstrapPatterns),
      token: "curl | sh",
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi4",
      title: "Command scope remains compact",
      severity: "medium",
      passed: mode === "balanced" ? true : !hasAny(output, chainingPatterns),
      reason:
        mode === "balanced"
          ? "Balanced mode allows limited chaining if earlier critical checks pass."
          : hasAny(output, chainingPatterns)
            ? "Strict mode requires a single inspectable command."
            : "The command stays within a single inspectable unit.",
      formula:
        "phi_4 := mode = strict -> |AST.Commands| = 1",
      evidence: firstEvidence(output, chainingPatterns),
      token: "command chaining",
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi5",
      title: "Read-only command shape preferred",
      severity: "medium",
      passed: hasAny(output, readonlyPatterns),
      reason: hasAny(output, readonlyPatterns)
        ? "The command matches a read-only inspection pattern."
        : "The command is not clearly read-only, so it needs refinement.",
      formula:
        "phi_5 := exists c in AST.Commands, read_only(c) = true",
      evidence: firstEvidence(output, readonlyPatterns),
    }),
  ];
}

function sqlConstraints(
  output: string,
  mode: SafetyMode,
  parseArtifact: ParseArtifact,
): ConstraintOutcome[] {
  const mutationPatterns = [
    /\bDROP\b/i,
    /\bDELETE\b/i,
    /\bTRUNCATE\b/i,
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bALTER\b/i,
    /\bCREATE\b/i,
  ];
  const multiStatementPatterns = [/;[\s\r\n]*\S+/];
  const selectStarPatterns = [/\bSELECT\s+\*/i];
  const readonlyEntryPatterns = [/^\s*(WITH\b[\s\S]+?\bSELECT\b|SELECT\b)/i];

  return [
    makeConstraint(parseArtifact, output, {
      id: "phi1",
      title: "Mutating SQL statements blocked",
      severity: "critical",
      passed: !hasAny(output, mutationPatterns),
      reason: hasAny(output, mutationPatterns)
        ? "The query contains a write or schema mutation keyword."
        : "No mutating SQL keyword was detected.",
      formula:
        "phi_1 := forall s in AST.Statements, action(s) notin {DROP, DELETE, TRUNCATE, INSERT, UPDATE, ALTER, CREATE}",
      evidence: firstEvidence(output, mutationPatterns),
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi2",
      title: "Single statement requirement",
      severity: "high",
      passed: !hasAny(output, multiStatementPatterns),
      reason: hasAny(output, multiStatementPatterns)
        ? "Multiple statements reduce inspectability and raise execution risk."
        : "The query is expressed as a single statement.",
      formula:
        "phi_2 := |AST.Statements| = 1",
      evidence: firstEvidence(output, multiStatementPatterns),
      token: ";",
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi3",
      title: "Read-only entry point required",
      severity: "medium",
      passed: hasAny(output, readonlyEntryPatterns),
      reason: hasAny(output, readonlyEntryPatterns)
        ? "The query begins with a read-only construct."
        : "The query does not clearly start with a read-only construct.",
      formula:
        "phi_3 := exists s in AST.Statements, action(s) = SELECT",
      evidence: firstEvidence(output, readonlyEntryPatterns),
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi4",
      title: "Bounded projection preferred",
      severity: "medium",
      passed: mode === "balanced" ? true : !hasAny(output, selectStarPatterns),
      reason:
        mode === "balanced"
          ? "Balanced mode allows broader projections for prototyping."
          : hasAny(output, selectStarPatterns)
            ? "Strict mode requires explicit column selection."
            : "The query uses an explicit projection.",
      formula:
        "phi_4 := mode = strict -> wildcard_projection(AST) = false",
      evidence: firstEvidence(output, selectStarPatterns),
      token: "SELECT *",
    }),
  ];
}

function pythonConstraints(
  output: string,
  parseArtifact: ParseArtifact,
): ConstraintOutcome[] {
  const dangerousExecutionPatterns = [
    /\bos\.system\s*\(/i,
    /\bsubprocess\./i,
    /\beval\s*\(/i,
    /\bexec\s*\(/i,
  ];
  const destructiveFilesystemPatterns = [
    /\bshutil\.rmtree\s*\(/i,
    /\bos\.remove\s*\(/i,
    /\bos\.unlink\s*\(/i,
    /\.unlink\s*\(/i,
    /\.write_text\s*\(/i,
    /\bopen\s*\([^)]*,\s*["']w/i,
  ];
  const suspiciousImports = [
    /\bimport\s+os\b/i,
    /\bfrom\s+os\b/i,
    /\bimport\s+subprocess\b/i,
    /\bimport\s+shutil\b/i,
  ];
  const pureShapePatterns = [/\bdef\b/i, /\breturn\b/i, /\bpathlib\b/i, /\bprint\s*\(/i];

  return [
    makeConstraint(parseArtifact, output, {
      id: "phi1",
      title: "Shell delegation blocked",
      severity: "critical",
      passed: !hasAny(output, dangerousExecutionPatterns),
      reason: hasAny(output, dangerousExecutionPatterns)
        ? "The code delegates control to the shell or a dangerous evaluator."
        : "No shell delegation or dangerous evaluator was detected.",
      formula:
        "phi_1 := forall call in AST.Calls, callee(call) notin {os.system, subprocess.*, eval, exec}",
      evidence: firstEvidence(output, dangerousExecutionPatterns),
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi2",
      title: "Filesystem mutation blocked",
      severity: "high",
      passed: !hasAny(output, destructiveFilesystemPatterns),
      reason: hasAny(output, destructiveFilesystemPatterns)
        ? "The code performs a file mutation or deletion that should be reviewed separately."
        : "No direct filesystem mutation was detected.",
      formula:
        "phi_2 := forall call in AST.Calls, mutates_filesystem(call) = false",
      evidence: firstEvidence(output, destructiveFilesystemPatterns),
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi3",
      title: "High-risk imports restricted",
      severity: "medium",
      passed: !hasAny(output, suspiciousImports),
      reason: hasAny(output, suspiciousImports)
        ? "The code imports a high-risk module commonly used for system-level side effects."
        : "No high-risk import was detected.",
      formula:
        "phi_3 := forall i in AST.Imports, module(i) notin {os, subprocess, shutil}",
      evidence: firstEvidence(output, suspiciousImports),
    }),
    makeConstraint(parseArtifact, output, {
      id: "phi4",
      title: "Deterministic code shape preferred",
      severity: "medium",
      passed: hasAny(output, pureShapePatterns),
      reason: hasAny(output, pureShapePatterns)
        ? "The code resembles deterministic business logic."
        : "The snippet is too open-ended to classify as deterministic safe logic.",
      formula:
        "phi_4 := exists n in AST.Nodes, deterministic_shape(n) = true",
      evidence: firstEvidence(output, pureShapePatterns),
    }),
  ];
}

function generalConstraints(
  output: string,
  parseArtifact: ParseArtifact,
): ConstraintOutcome[] {
  return [
    makeConstraint(parseArtifact, output, {
      id: "phi1",
      title: "Specialized verifier required",
      severity: "medium",
      passed: false,
      reason:
        "The output could not be confidently mapped to a specialized verifier, so execution should pause for refinement or routing.",
      formula:
        "phi_1 := classified_domain(output) != general",
      evidence: output.split(/\r?\n/)[0],
    }),
  ];
}

function summarizeVerdict(verdict: SafetyVerdict, detection: DetectionResult) {
  if (verdict === "accept") {
    return `Verified as a ${detection.domain} output with no blocking constraint failures.`;
  }

  if (verdict === "reject") {
    return `Structural violation detected in the ${detection.domain} output. One or more blocking formulas failed during verification.`;
  }

  return `The ${detection.domain} candidate is partially compliant, but it still requires a narrower rewrite before execution.`;
}

function nextStepForVerdict(verdict: SafetyVerdict) {
  if (verdict === "accept") {
    return "Allow execution or forward to human approval with the proof artifact attached.";
  }

  if (verdict === "reject") {
    return "Block execution and issue a constrained regeneration request.";
  }

  return "Tighten the grammar and re-run the candidate through the verifier.";
}

function buildRefinementPrompt(
  input: VerificationInput,
  detection: DetectionResult,
  failingConstraints: ConstraintOutcome[],
) {
  const failures = failingConstraints
    .map((constraint) => `${constraint.id}: ${constraint.title}`)
    .join(", ");

  return `Rewrite the ${detection.domain} output for "${input.userPrompt}" so it satisfies ${failures} and remains read-only, deterministic, and auditable.`;
}

function extractLikelySqlTable(output: string) {
  const match = output.match(/\b(?:FROM|TRUNCATE|DELETE\s+FROM|UPDATE)\s+([A-Za-z_][\w]*)/i);
  return match?.[1] ?? "records";
}

function buildRefinementPlan(
  input: VerificationInput,
  detection: DetectionResult,
  failingConstraints: ConstraintOutcome[],
): RefinementPlan | undefined {
  if (failingConstraints.length === 0) {
    return undefined;
  }

  const prompt = buildRefinementPrompt(input, detection, failingConstraints);

  if (detection.domain === "shell") {
    return {
      prompt,
      candidate:
        "Get-ChildItem -Path .\\temp -File | Select-Object FullName, Length, LastWriteTime",
      rationale: [
        "Converted the destructive action into a read-only inspection command.",
        "Removed shell primitives that mutate or delete host resources.",
      ],
    };
  }

  if (detection.domain === "sql") {
    const table = extractLikelySqlTable(input.modelOutput);

    return {
      prompt,
      candidate:
        `SELECT record_id, created_at, status\nFROM ${table}\nORDER BY created_at DESC;`,
      rationale: [
        "Collapsed the candidate into a single read-only statement.",
        "Removed mutating SQL actions and retained audit-friendly analytics output.",
      ],
    };
  }

  if (detection.domain === "python") {
    return {
      prompt,
      candidate:
        "from pathlib import Path\n\n\ndef preview_temp_files(root: str) -> list[str]:\n    return [str(path) for path in Path(root).iterdir() if path.is_file()]",
      rationale: [
        "Replaced shell delegation with deterministic pathlib inspection.",
        "Preserved the user's maintenance intent without mutating the filesystem.",
      ],
    };
  }

  return {
    prompt,
    candidate: "Request a specialized verifier before attempting execution.",
    rationale: [
      "The candidate could not be routed to a domain-specific verification chain.",
    ],
  };
}

function buildViolationTrace(constraints: ConstraintOutcome[]): VerificationTraceEntry[] {
  return constraints
    .filter((constraint) => !constraint.passed)
    .map((constraint) => ({
      id: `${constraint.id}-trace`,
      formulaId: constraint.id,
      severity: constraint.severity,
      line: constraint.location?.line,
      excerpt:
        constraint.location?.excerpt ??
        constraint.evidence ??
        "No pinpointed source excerpt was available.",
      message: `${constraint.id} violated: ${constraint.title}`,
      nodeId: constraint.nodeId,
    }));
}

function checksum(input: string) {
  let total = 0;

  for (const character of input) {
    total = (total * 31 + character.charCodeAt(0)) % 1_000_000_007;
  }

  return `asvl-${total.toString(16)}`;
}

function buildProofArtifact(
  parseArtifact: ParseArtifact,
  failingConstraints: ConstraintOutcome[],
  generatedAt: string,
): ProofArtifact {
  return {
    schema: "asvl-proof@0.2",
    checksum: checksum(
      `${generatedAt}:${parseArtifact.domain}:${failingConstraints.map((item) => item.id).join(",")}:${parseArtifact.tokens.map((token) => token.value).join("|")}`,
    ),
    tokenCount: parseArtifact.tokens.length,
    astNodeCount: countAstNodes(parseArtifact.root),
    failingConstraintIds: failingConstraints.map((constraint) => constraint.id),
    generatedAt,
    domain: parseArtifact.domain,
  };
}

function buildLogs(
  detection: DetectionResult,
  parseArtifact: ParseArtifact,
  failingConstraints: ConstraintOutcome[],
): VerificationLogEntry[] {
  return [
    {
      phase: "intercept",
      status: "done",
      message: "Candidate output intercepted before execution.",
    },
    {
      phase: "classify",
      status: detection.domain === "general" ? "warn" : "done",
      message: `Domain detector routed the candidate to ${detection.domain} with ${Math.round(detection.confidence * 100)}% confidence.`,
    },
    {
      phase: "parse",
      status: "done",
      message: `Constructed ${countAstNodes(parseArtifact.root)} AST nodes and ${parseArtifact.tokens.length} tokens.`,
    },
    {
      phase: "verify",
      status: failingConstraints.length > 0 ? "warn" : "done",
      message:
        failingConstraints.length > 0
          ? `${failingConstraints.length} formula checks failed during structural verification.`
          : "All synthesized formulas passed structural verification.",
    },
  ];
}

export function verifyCandidate(input: VerificationInput): VerificationReport {
  const normalizedOutput = input.modelOutput.trim();
  const detection = detectDomain(input);
  const grammar = synthesizeGrammar(input, detection);
  const parseArtifact = parseCandidate(detection.domain, normalizedOutput);

  const constraints =
    detection.domain === "shell"
      ? shellConstraints(normalizedOutput, input.mode, parseArtifact)
      : detection.domain === "sql"
        ? sqlConstraints(normalizedOutput, input.mode, parseArtifact)
        : detection.domain === "python"
          ? pythonConstraints(normalizedOutput, parseArtifact)
          : generalConstraints(normalizedOutput, parseArtifact);

  const failed = constraints.filter((constraint) => !constraint.passed);
  const hasBlockingFailure = failed.some(
    (constraint) =>
      constraint.severity === "critical" || constraint.severity === "high",
  );

  const verdict: SafetyVerdict =
    failed.length === 0 ? "accept" : hasBlockingFailure ? "reject" : "refine";
  const generatedAt = new Date().toISOString();
  const violationTrace = buildViolationTrace(constraints);
  const proofArtifact = buildProofArtifact(parseArtifact, failed, generatedAt);
  const refinement = buildRefinementPlan(input, detection, failed);
  const logs = buildLogs(detection, parseArtifact, failed);

  const rawProofJson = JSON.stringify(
    {
      policyVersion: POLICY_VERSION,
      generatedAt,
      detection,
      grammar,
      proofArtifact,
      constraints,
      violationTrace,
      parseArtifact: {
        domain: parseArtifact.domain,
        summary: parseArtifact.summary,
        tokenCount: parseArtifact.tokens.length,
        astNodeCount: countAstNodes(parseArtifact.root),
      },
    },
    null,
    2,
  );

  return {
    verdict,
    summary: summarizeVerdict(verdict, detection),
    nextStep: nextStepForVerdict(verdict),
    domain: detection.domain,
    confidence: detection.confidence,
    riskLevel: detection.riskLevel,
    mode: input.mode,
    normalizedOutput,
    grammar,
    parseArtifact,
    constraints,
    violationTrace,
    proofArtifact,
    rawProofJson,
    refinement,
    logs,
    signals: detection.signals,
    generatedAt,
    policyVersion: POLICY_VERSION,
  };
}
