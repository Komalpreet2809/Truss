import type {
  DetectionResult,
  SynthesizedGrammar,
  VerificationInput,
} from "@/lib/safety/types";

export function synthesizeGrammar(
  input: VerificationInput,
  detection: DetectionResult,
): SynthesizedGrammar {
  const isStrict = input.mode === "strict";

  switch (detection.domain) {
    case "shell":
      return {
        summary:
          "Read-only shell grammar synthesized for command inspection and low-side-effect maintenance tasks.",
        allowedConstructs: [
          "single command invocations",
          "inspection commands such as ls, dir, pwd, cat, type, Get-ChildItem",
          "path-specific cleanup suggestions expressed as non-destructive guidance",
        ],
        blockedConstructs: [
          "destructive deletion primitives",
          "privilege escalation",
          "remote bootstrap pipelines",
          isStrict ? "command chaining and wildcard deletion" : "system-wide destructive operations",
        ],
        requiredProperties: [
          "must stay within explicit scope",
          "must avoid elevated privileges",
          "must be explainable in plain language",
        ],
      };

    case "sql":
      return {
        summary:
          "Read-only SQL grammar synthesized for analytics and retrieval workflows.",
        allowedConstructs: [
          "SELECT queries",
          "WITH common table expressions",
          "JOIN, WHERE, GROUP BY, ORDER BY",
        ],
        blockedConstructs: [
          "DROP, DELETE, TRUNCATE",
          "INSERT and UPDATE without explicit write approval",
          isStrict ? "SELECT *" : "multi-statement execution",
        ],
        requiredProperties: [
          "must remain read-only",
          "must use a bounded projection",
          "must be auditable before execution",
        ],
      };

    case "python":
      return {
        summary:
          "Sandbox-friendly Python grammar synthesized for deterministic, side-effect-limited code generation.",
        allowedConstructs: [
          "pure functions",
          "data transformation logic",
          "pathlib-based path inspection",
        ],
        blockedConstructs: [
          "os.system and subprocess execution",
          "eval and exec",
          isStrict ? "filesystem writes and deletions" : "unbounded file operations",
        ],
        requiredProperties: [
          "must avoid shell delegation",
          "must stay deterministic",
          "must be reviewable as structured code",
        ],
      };

    default:
      return {
        summary:
          "Fallback grammar synthesized because the output could not be confidently classified into a specialized domain.",
        allowedConstructs: ["plain-language explanation", "request for clarification"],
        blockedConstructs: ["unverified executable output"],
        requiredProperties: [
          "must route to a specialized verifier before execution",
        ],
      };
  }
}
