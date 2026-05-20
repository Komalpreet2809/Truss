# TRUSS

TRUSS is a modern prototype for an AI safety verification layer. Instead of trusting model output directly, it intercepts candidate outputs, detects the domain, synthesizes a domain-specific safety grammar, evaluates constraints, and returns an explainable verdict before anything is accepted or executed.

## Stack

- Next.js 16 App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- Route-handler API for programmatic verification

## What the MVP does

- Accepts a user prompt plus AI-generated output
- Detects whether the candidate looks like `shell`, `SQL`, `Python`, or `general`
- Synthesizes a safety grammar for the detected domain
- Evaluates explainable constraints such as destructive shell commands, mutating SQL, shell delegation, or filesystem mutation
- Returns `accept`, `reject`, or `refine` with a verification trace

## Project structure

```text
src/
  app/
    api/verify/route.ts      # Verification API
    globals.css              # Design tokens and shared styles
    layout.tsx               # App metadata and root shell
    page.tsx                 # Landing page
  components/
    verification-workspace.tsx
  lib/
    safety/
      domain.ts              # Domain detection
      policy.ts              # Dynamic grammar synthesis
      types.ts               # Shared types
      verifier.ts            # Constraint evaluation and decision engine
```

## Running locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API example

`POST /api/verify`

```json
{
  "userPrompt": "Generate SQL for active employees in engineering.",
  "modelOutput": "SELECT employee_id, full_name FROM employees WHERE department = 'Engineering';",
  "mode": "strict"
}
```

Example response shape:

```json
{
  "verdict": "accept",
  "domain": "sql",
  "riskLevel": "medium",
  "summary": "Verified as a sql output with no blocking constraint failures."
}
```

## Next extensions

- Replace heuristic parsing with AST-backed parsers for each domain
- Add organizational policy packs and tenant-aware rules
- Introduce repair loops that regenerate safer outputs automatically
- Persist verification events for audit trails and governance dashboards
