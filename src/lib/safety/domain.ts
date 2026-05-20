import type {
  DetectionResult,
  DetectionSignal,
  RiskLevel,
  SafetyDomain,
  VerificationInput,
} from "@/lib/safety/types";

const DOMAIN_TOKENS: Record<SafetyDomain, string[]> = {
  shell: [
    "bash",
    "shell",
    "terminal",
    "command",
    "rm",
    "sudo",
    "chmod",
    "powershell",
    "get-childitem",
    "curl",
    "wget",
  ],
  sql: [
    "sql",
    "select",
    "from",
    "where",
    "join",
    "drop",
    "truncate",
    "delete",
    "update",
    "insert",
  ],
  python: [
    "python",
    "def ",
    "import ",
    "print(",
    "os.system",
    "subprocess",
    "pathlib",
    "lambda",
    "pip",
  ],
  general: [],
};

const HIGH_RISK_TOKENS = [
  "delete",
  "drop",
  "truncate",
  "sudo",
  "root",
  "admin",
  "prod",
  "production",
  "rm -rf",
  "format",
  "shutdown",
  "reboot",
  "destroy",
];

const MEDIUM_RISK_TOKENS = [
  "write",
  "modify",
  "filesystem",
  "database",
  "employee",
  "execute",
  "cleanup",
  "system",
];

function collectSignals(source: "prompt" | "output", text: string) {
  const signals: Record<SafetyDomain, DetectionSignal[]> = {
    shell: [],
    sql: [],
    python: [],
    general: [],
  };

  for (const [domain, tokens] of Object.entries(DOMAIN_TOKENS) as [
    SafetyDomain,
    string[],
  ][]) {
    for (const token of tokens) {
      if (text.includes(token)) {
        signals[domain].push({
          source,
          token,
          weight: token.length > 5 ? 2 : 1,
        });
      }
    }
  }

  return signals;
}

function deriveRiskLevel(prompt: string, output: string): RiskLevel {
  const combined = `${prompt} ${output}`;

  if (HIGH_RISK_TOKENS.some((token) => combined.includes(token))) {
    return "high";
  }

  if (MEDIUM_RISK_TOKENS.some((token) => combined.includes(token))) {
    return "medium";
  }

  return "low";
}

export function detectDomain(input: VerificationInput): DetectionResult {
  const prompt = input.userPrompt.trim().toLowerCase();
  const output = input.modelOutput.trim().toLowerCase();

  const promptSignals = collectSignals("prompt", prompt);
  const outputSignals = collectSignals("output", output);

  const totals: Record<SafetyDomain, number> = {
    shell: 0,
    sql: 0,
    python: 0,
    general: 0,
  };

  for (const domain of ["shell", "sql", "python"] as SafetyDomain[]) {
    totals[domain] =
      promptSignals[domain].reduce((sum, signal) => sum + signal.weight, 0) +
      outputSignals[domain].reduce((sum, signal) => sum + signal.weight, 0);
  }

  let bestDomain: SafetyDomain = "general";
  let bestScore = 0;

  for (const domain of ["shell", "sql", "python"] as SafetyDomain[]) {
    if (totals[domain] > bestScore) {
      bestDomain = domain;
      bestScore = totals[domain];
    }
  }

  const signals =
    bestDomain === "general"
      ? []
      : [...promptSignals[bestDomain], ...outputSignals[bestDomain]];

  const confidence =
    bestDomain === "general"
      ? 0.38
      : Math.min(0.98, 0.54 + bestScore / 20 + signals.length * 0.02);

  return {
    domain: bestDomain,
    confidence: Number(confidence.toFixed(2)),
    riskLevel: deriveRiskLevel(prompt, output),
    signals,
  };
}
