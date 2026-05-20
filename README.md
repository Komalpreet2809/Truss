# TRUSS

TRUSS is an AI safety verification prototype built around one core idea:

**do not trust model output by default.**

Instead of sending generated code or queries straight into the real world, TRUSS intercepts candidate output, detects its domain, synthesizes safety rules for that domain, parses the candidate into a structured form, evaluates explicit constraints, and returns an explainable verdict before execution.

The current implementation is a modern interactive prototype for demonstrating that verification layer across `shell`, `sql`, and `python` scenarios.

## What TRUSS Does

TRUSS turns the usual flow:

`User -> Model -> Output`

into:

`User -> Model -> Intercept -> Detect -> Synthesize -> Parse -> Verify -> Accept / Reject / Refine`

For each candidate, the system:

- classifies the likely domain
- generates a domain-aware safety grammar
- tokenizes and parses the output into a lightweight structural artifact
- evaluates transparent constraint formulas
- produces an explainable verification report
- suggests a safer refinement when the candidate fails

## Why It Exists

Most AI safety tooling still depends on trust-heavy techniques such as static blocklists, heuristic filters, or moderation checks layered after generation.

TRUSS is trying to show a different product direction:

- outputs should be intercepted before execution
- safety policy should be visible and inspectable
- verification should produce a trace, not just a pass/fail badge
- unsafe outputs should trigger refinement rather than silent failure

## Current Prototype Scope

This repo is intentionally focused on a strong demoable MVP.

Supported domains:

- `shell`
- `sql`
- `python`
- fallback `general`

Supported outcomes:

- `accept`
- `reject`
- `refine`

Built-in stress-test scenarios include:

- destructive bash execution
- obfuscated Python deletion attempts
- mixed safe/unsafe SQL
- remote shell bootstrap pipelines
- safe analytics SQL

## Product Experience

The UI is designed as a transparent verification workspace rather than a chatbot wrapper.

It exposes:

- intercepted user prompt and candidate output
- domain detection and confidence
- generated safety formulas
- grammar matrix
- token ledger
- lightweight AST view
- violation timeline
- proof artifact metadata
- raw proof JSON
- auto-refinement loop

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- Route Handlers for the verification API

## Architecture

Core flow:

1. `Domain detection`
   Detects whether the candidate is likely `shell`, `sql`, `python`, or `general`.

2. `Grammar synthesis`
   Produces allowed, blocked, and required constructs for the detected domain.

3. `Parsing`
   Builds a deterministic structured artifact from the candidate output.

4. `Constraint evaluation`
   Applies explicit safety checks and records evidence for failures.

5. `Verdict generation`
   Returns `accept`, `reject`, or `refine` with a complete trace.

6. `Refinement`
   Produces a safer candidate when rejection or repair is appropriate.

## Project Structure

```text
src/
  app/
    api/verify/route.ts              # Verification API
    globals.css                      # Theme tokens, typography, motion, UI utilities
    layout.tsx                       # App metadata and root shell
    page.tsx                         # Top-level page composition
  components/
    theme-toggle-button.tsx          # Theme toggle control
    verification-workspace.tsx       # Main product UI
  lib/
    safety/
      domain.ts                      # Domain detection logic
      index.ts                       # Public safety exports
      parser.ts                      # Lightweight parser + structural artifacts
      policy.ts                      # Grammar / policy synthesis
      scenarios.ts                   # Built-in demo scenarios
      types.ts                       # Shared safety and report types
      verifier.ts                    # Decision engine and verification report builder
public/
  truss-mark.svg                     # Shared TRUSS brand mark / favicon asset
```

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Useful commands:

```bash
npm run lint
npm run build
npm run start
```

## Verification API

`POST /api/verify`

Request body:

```json
{
  "userPrompt": "Generate SQL for active employees in engineering.",
  "modelOutput": "SELECT employee_id, full_name FROM employees WHERE department = 'Engineering';",
  "mode": "strict"
}
```

`mode` currently supports:

- `strict`
- `balanced`

Example response shape:

```json
{
  "verdict": "accept",
  "summary": "Verified as a sql output with no blocking constraint failures.",
  "nextStep": "Allow candidate to proceed.",
  "domain": "sql",
  "confidence": 0.96,
  "riskLevel": "medium",
  "mode": "strict",
  "grammar": {
    "summary": "Read-only SQL grammar with bounded clauses.",
    "allowedConstructs": ["SELECT", "FROM", "WHERE", "ORDER BY"],
    "blockedConstructs": ["DROP", "DELETE", "TRUNCATE", "UPDATE", "INSERT"],
    "requiredProperties": ["single statement", "read-only intent"]
  },
  "constraints": [],
  "violationTrace": [],
  "proofArtifact": {
    "schema": "truss.proof.v1",
    "checksum": "sha256:...",
    "tokenCount": 14,
    "astNodeCount": 6,
    "failingConstraintIds": [],
    "generatedAt": "2026-05-21T00:00:00.000Z",
    "domain": "sql"
  }
}
```

## Design Notes

The current interface uses:

- a warm editorial dark mode instead of pure black
- a restrained palette based on paper, charcoal, dusty coral, and muted blue
- motion for state transitions and verification flow emphasis
- deterministic demo scenarios so the product can be evaluated without relying on unpredictable live model output

## Current Limitations

This is a transparent prototype, not a finished formal methods backend.

Right now TRUSS uses:

- lightweight deterministic parsing
- explicit heuristics and rule checks
- structured proof-like artifacts for explainability

It does **not** yet use:

- full language parsers for every domain
- an SMT solver or theorem prover
- persistent audit storage
- multi-tenant policy management
- live LLM orchestration by default

## Where To Take It Next

High-value next steps:

1. Replace lightweight parsing with AST-backed parsers for `shell`, `sql`, and `python`.
2. Add policy packs for organizations, environments, and risk profiles.
3. Persist verification events for governance, audit, and replay.
4. Add live model integration behind the current deterministic scenario mode.
5. Introduce a formal solver-backed verification path for high-assurance cases.
6. Add auth, workspaces, and policy administration for enterprise use.

## Positioning

If you need a short explanation for demos or submissions:

> TRUSS is an AI safety verification layer that dynamically synthesizes safety rules, parses AI-generated outputs into structured artifacts, and verifies them before they are accepted or executed.
