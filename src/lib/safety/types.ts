export type SafetyDomain = "shell" | "sql" | "python" | "general";

export type SafetyMode = "strict" | "balanced";

export type SafetyVerdict = "accept" | "reject" | "refine";

export type RiskLevel = "low" | "medium" | "high";

export type Severity = "low" | "medium" | "high" | "critical";

export type NodeStatus = "safe" | "blocked" | "neutral";

export interface VerificationInput {
  userPrompt: string;
  modelOutput: string;
  mode: SafetyMode;
}

export interface DetectionSignal {
  source: "prompt" | "output";
  token: string;
  weight: number;
}

export interface DetectionResult {
  domain: SafetyDomain;
  confidence: number;
  riskLevel: RiskLevel;
  signals: DetectionSignal[];
}

export interface SynthesizedGrammar {
  summary: string;
  allowedConstructs: string[];
  blockedConstructs: string[];
  requiredProperties: string[];
}

export interface SourceLocation {
  line: number;
  columnStart: number;
  columnEnd: number;
  excerpt: string;
}

export interface ParsedToken {
  id: string;
  value: string;
  normalized: string;
  kind: string;
  line: number;
  blocked: boolean;
  reason?: string;
}

export interface AstNode {
  id: string;
  label: string;
  kind: string;
  status: NodeStatus;
  line?: number;
  detail?: string;
  children: AstNode[];
}

export interface ParseArtifact {
  domain: SafetyDomain;
  root: AstNode;
  tokens: ParsedToken[];
  lineMap: string[];
  summary: string;
}

export interface ConstraintOutcome {
  id: string;
  title: string;
  severity: Severity;
  passed: boolean;
  reason: string;
  formula: string;
  evidence?: string;
  token?: string;
  nodeId?: string;
  location?: SourceLocation;
}

export interface VerificationTraceEntry {
  id: string;
  formulaId: string;
  severity: Severity;
  line?: number;
  excerpt: string;
  message: string;
  nodeId?: string;
}

export interface ProofArtifact {
  schema: string;
  checksum: string;
  tokenCount: number;
  astNodeCount: number;
  failingConstraintIds: string[];
  generatedAt: string;
  domain: SafetyDomain;
}

export interface RefinementPlan {
  prompt: string;
  candidate: string;
  rationale: string[];
}

export interface VerificationLogEntry {
  phase: string;
  status: "done" | "warn";
  message: string;
}

export interface VerificationReport {
  verdict: SafetyVerdict;
  summary: string;
  nextStep: string;
  domain: SafetyDomain;
  confidence: number;
  riskLevel: RiskLevel;
  mode: SafetyMode;
  normalizedOutput: string;
  grammar: SynthesizedGrammar;
  parseArtifact: ParseArtifact;
  constraints: ConstraintOutcome[];
  violationTrace: VerificationTraceEntry[];
  proofArtifact: ProofArtifact;
  rawProofJson: string;
  refinement?: RefinementPlan;
  logs: VerificationLogEntry[];
  signals: DetectionSignal[];
  generatedAt: string;
  policyVersion: string;
}
