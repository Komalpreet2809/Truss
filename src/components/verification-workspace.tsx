"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { detectDomain, SCENARIOS } from "@/lib/safety";
import type {
  AstNode,
  ConstraintOutcome,
  NodeStatus,
  SafetyMode,
  VerificationReport,
} from "@/lib/safety";

/* ──────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────── */

function prettyPercent(v: number) {
  return `${Math.round(v * 100)}%`;
}

function fmtLine(n: number) {
  return n.toString().padStart(2, "0");
}

function pad(i: number) {
  return (i + 1).toString().padStart(2, "0");
}

function verdictLabel(v: VerificationReport["verdict"]) {
  if (v === "accept") return "Safe Output Verified";
  if (v === "reject") return "Structural Violation Detected";
  return "Refinement Required";
}

function verdictInfo(v: VerificationReport["verdict"]) {
  if (v === "accept") return { color: "var(--accent-blue)", icon: "✓", bg: "var(--accent-blue-soft)" };
  if (v === "reject") return { color: "var(--accent-coral)", icon: "✕", bg: "var(--accent-coral-soft)" };
  return { color: "var(--accent-charcoal)", icon: "↻", bg: "var(--bg-card)" };
}

function domainIcon(cat: string, color: string) {
  if (cat === "shell")
    return (
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    );
  if (cat === "sql")
    return (
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      </svg>
    );
  if (cat === "python")
    return (
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M8 12l2 2 4-4" />
      </svg>
    );
  return (
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function scenarioCardStyle(selected: boolean): React.CSSProperties {
  if (selected) {
    return {
      background: "var(--accent-coral-soft)",
      border: "1px solid rgba(231, 161, 142, 0.28)",
      boxShadow: "0 12px 28px rgba(0, 0, 0, 0.16), inset 0 0 0 1px rgba(255,255,255,0.03)",
    };
  }

  return {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid var(--border-default)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02)",
  };
}

function nodeStyle(s: NodeStatus) {
  if (s === "blocked") return "border-[var(--accent-coral)]/15 bg-[var(--accent-coral-soft)]";
  if (s === "safe") return "border-[var(--accent-blue)]/20 bg-[var(--accent-blue-soft)]";
  return "border-[var(--border-subtle)] bg-[var(--bg-card)]";
}

function constraintColor(c: ConstraintOutcome) {
  if (c.passed) return { dot: "var(--accent-blue)", badge: "bg-[var(--accent-blue-soft)] text-[var(--text-primary)]" };
  if (c.severity === "critical" || c.severity === "high")
    return { dot: "var(--accent-coral)", badge: "bg-[var(--accent-coral-soft)] text-[var(--text-primary)]" };
  return { dot: "var(--accent-charcoal)", badge: "bg-[var(--bg-card)] text-[var(--text-primary)]" };
}

/* ──────────────────────────────────────────────────
   Sub-components
   ────────────────────────────────────────────────── */



function SLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[10px] font-semibold uppercase tracking-[0.25em]" style={{ color: "var(--text-muted)" }}>{children}</p>;
}

/* ── Zigzag section with blob ── */
function BlobSection({
  number,
  reverse,
  blobVariant = "blob",
  children,
  illustration,
  className = "",
  style = {},
}: {
  number: string;
  reverse?: boolean;
  blobVariant?: "blob" | "blob-alt" | "blob-soft" | "blob-wide";
  children: React.ReactNode;
  illustration?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div 
      className={`relative flex flex-col gap-6 py-8 md:py-12 ${reverse ? "md:flex-row-reverse" : "md:flex-row"} md:items-center md:gap-12 ${className}`}
      style={style}
    >
      {/* Blob with illustration */}
      <div className="relative flex flex-shrink-0 items-center justify-center md:w-[44%]">
        <div className={`${blobVariant} motion-blob flex h-64 w-full max-w-sm items-center justify-center p-10 md:h-80`}>
          {illustration}
        </div>
        {/* Big number */}
        <span className={`big-number absolute ${reverse ? "-right-2 md:-right-6" : "-left-2 md:-left-6"} bottom-0`}>
          {number}
        </span>
      </div>
      {/* Content */}
      <div className="flex-1 space-y-4 md:max-w-lg">
        {children}
      </div>
    </div>
  );
}

/* ── Code frame ── */
function CodeFrame({
  code,
  title,
  highlightedLines = [],
  isScanning = false,
}: {
  code: string;
  title: string;
  highlightedLines?: number[];
  isScanning?: boolean;
}) {
  const lines = code.replace(/\r\n/g, "\n").split("\n");
  const hl = new Set(highlightedLines);
  return (
    <div className="relative overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-default)", background: "var(--bg-white)" }}>
      {isScanning && (
        <div 
          className="absolute left-0 right-0 top-0 z-10 h-0.5 bg-gradient-to-r from-transparent via-[var(--accent-coral)] to-transparent opacity-80 animate-sweep-down pointer-events-none"
        />
      )}
      <div className="flex items-center justify-between border-b px-4 py-2" style={{ borderColor: "var(--border-subtle)" }}>
        <SLabel>{title}</SLabel>
        <div className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full opacity-50 transition-transform duration-300 hover:scale-125" style={{ background: "var(--accent-coral)" }} />
          <span className="h-2 w-2 rounded-full opacity-50 transition-transform duration-300 hover:scale-125" style={{ background: "var(--accent-blue)" }} />
          <span className="h-2 w-2 rounded-full opacity-50 transition-transform duration-300 hover:scale-125" style={{ background: "var(--accent-charcoal)" }} />
        </div>
      </div>
      <div className="max-h-56 overflow-auto px-3 py-2 font-mono text-sm leading-7" style={{ color: "var(--text-primary)" }}>
        {lines.map((line, i) => {
          const ln = i + 1;
          const isHighlighted = hl.has(ln);
          return (
            <div
              key={`${title}-${ln}`}
              className={`grid grid-cols-[2rem_1fr] gap-2 rounded-md px-1.5 py-0.5 transition-colors duration-200 ${isHighlighted ? "" : "hover:bg-[var(--bg-warm)]/30"}`}
              style={
                isHighlighted
                  ? {
                      background: "var(--bg-highlight)",
                      boxShadow: "inset 0 0 0 1px var(--accent-coral-soft)",
                    }
                  : undefined
              }
            >
              <span className="text-right text-xs" style={{ color: "var(--text-faint)" }}>{fmtLine(ln)}</span>
              <span className="whitespace-pre-wrap break-words">{line || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── AST tree ── */
function AstBranch({ node, depth = 0 }: { node: AstNode; depth?: number }) {
  return (
    <div className="relative space-y-1.5">
      <div className="flex gap-2" style={{ marginLeft: depth * 14 }}>
        {depth > 0 && <div className="w-3 border-l border-dashed" style={{ borderColor: "var(--border-default)" }} />}
        <div className={`flex-1 rounded-lg border px-3 py-2 ${nodeStyle(node.status)}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{node.label}</p>
              <p className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                {node.kind}{node.line ? ` · L${node.line}` : ""}
              </p>
            </div>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>{node.status}</span>
          </div>
          {node.detail && <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{node.detail}</p>}
        </div>
      </div>
      {node.children.map((c) => <AstBranch key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

/* ── Expandable section ── */
function Expandable({
  title,
  badge,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  badge?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border interactive-hover-card" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-card)" }}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-[var(--bg-warm)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="font-serif text-base transition-colors duration-300 hover:text-[var(--accent-coral)]" style={{ color: "var(--text-primary)" }}>{title}</span>
          {badge && (
            <span className="rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest transition-transform duration-300 hover:scale-105"
              style={{ background: "var(--accent-coral-soft)", color: "var(--accent-coral)" }}
            >{badge}</span>
          )}
        </div>
        <span className="text-lg transition-transform duration-300" style={{
          color: "var(--text-faint)",
          transform: expanded ? "rotate(45deg)" : "rotate(0)",
        }}>+</span>
      </button>
      {expanded && (
        <div className="border-t px-5 py-5 motion-slide-up" style={{ borderColor: "var(--border-subtle)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   Main Workspace
   ══════════════════════════════════════════════════ */

export function VerificationWorkspace() {
  const init = SCENARIOS[2] ?? SCENARIOS[0];
  const [selId, setSelId] = useState(init.id);
  const [userPrompt, setUserPrompt] = useState(init.prompt);
  const [modelOutput, setModelOutput] = useState(init.output);
  const [mode, setMode] = useState<SafetyMode>(init.mode);
  const [report, setReport] = useState<VerificationReport | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const boot = useRef(false);

  const dp = useDeferredValue(userPrompt);
  const dm = useDeferredValue(modelOutput);
  const live = detectDomain({ userPrompt: dp, modelOutput: dm, mode });

  const hlLines = useMemo(
    () => Array.from(new Set(report?.violationTrace.map((t) => t.line).filter((l): l is number => typeof l === "number") ?? [])),
    [report],
  );

  const vi = verdictInfo(report?.verdict ?? "refine");

  const run = useCallback(
    async (p = userPrompt, o = modelOutput, m = mode) => {
      setIsPending(true);
      setError(null);
      try {
        const r = await fetch("/api/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userPrompt: p, modelOutput: o, mode: m }),
        });
        const d = (await r.json()) as VerificationReport & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Verification failed.");
        setReport(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verification failed.");
      } finally {
        setIsPending(false);
      }
    },
    [mode, modelOutput, userPrompt],
  );

  function pick(id: string) {
    const s = SCENARIOS.find((x) => x.id === id);
    if (!s) return;
    setSelId(s.id);
    setUserPrompt(s.prompt);
    setModelOutput(s.output);
    setMode(s.mode);
    setError(null);
    startTransition(() => { void run(s.prompt, s.output, s.mode); });
  }

  function refine() {
    if (!report?.refinement) return;
    const c = report.refinement.candidate;
    setModelOutput(c);
    startTransition(() => { void run(userPrompt, c, mode); });
  }

  function toggle(id: string) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  useEffect(() => {
    if (boot.current) return;
    boot.current = true;
    startTransition(() => { void run(init.prompt, init.output, init.mode); });
  }, [init.mode, init.output, init.prompt, run]);

  const blobs: Array<"blob" | "blob-alt" | "blob-soft" | "blob-wide"> = ["blob", "blob-alt", "blob-soft", "blob-wide", "blob"];

  /* ─── Render ─── */
  return (
    <div className="relative mx-auto flex w-full max-w-[1100px] flex-col px-5 pb-24 pt-8 lg:px-8">

      {/* ═══ HEADER ═══ */}
      <header className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl" style={{ background: "var(--bg-blob)" }}>
            <span
              className="h-5 w-5"
              style={{
                background: "var(--text-primary)",
                WebkitMaskImage: "url('/truss-mark.svg')",
                maskImage: "url('/truss-mark.svg')",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
              aria-hidden="true"
            />
          </div>
          <div>
            <span
              className="text-[1.15rem] font-semibold uppercase tracking-[0.08em]"
              style={{ color: "var(--text-primary)" }}
            >
              TRUSS
            </span>
            <p className="text-[9px] uppercase tracking-[0.3em]" style={{ color: "var(--text-faint)" }}>Safety Verification</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden max-w-[200px] text-right sm:block">
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              An AI safety verification layer that intercepts outputs, synthesizes grammars, and returns explainable verdicts.
            </p>
          </div>
        </div>
      </header>

      {/* ═══ DECORATIVE DIVIDER ═══ */}
      <div className="mt-8 flex items-center justify-center gap-3.5">
        <div className="h-[1px] w-12" style={{ background: "var(--border-default)" }} />
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>•</span>
        <div className="h-[1px] w-12" style={{ background: "var(--border-default)" }} />
      </div>

      {/* ═══ HERO ═══ */}
      <section className="mt-6 motion-slide-up">
        <h1 className="text-hero">
          Current safety<br />verifications
        </h1>
      </section>

      {/* ═══ SCENARIO ZIGZAG ═══ */}
      <section className="mt-6">
        {SCENARIOS.map((s, i) => (
          <BlobSection
            key={s.id}
            number={pad(i)}
            reverse={i % 2 !== 0}
            blobVariant={blobs[i % blobs.length]}
            className="motion-slide-up"
            style={{ animationDelay: `${i * 120}ms` }}
            illustration={
              <button
                type="button"
                onClick={() => pick(s.id)}
                className="group flex flex-col items-center gap-3 transition-transform duration-300 hover:scale-105 active:scale-95"
              >
                <div
                  className={`rounded-[1.7rem] p-4 transition-all duration-500 group-hover:-translate-y-0.5 ${
                    s.id === selId ? "scenario-btn-active" : ""
                  }`}
                  style={scenarioCardStyle(s.id === selId)}
                >
                  {domainIcon(
                    s.category,
                    s.id === selId ? "var(--accent-coral)" : "var(--text-secondary)",
                  )}
                </div>
                {s.id === selId && (
                  <svg className="animate-pop-in" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                )}
              </button>
            }
          >
            <h2 className="text-section">{s.title}?</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {s.description}
            </p>
            <div className="flex items-center gap-2">
              <span className="rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest transition-colors duration-300 hover:border-[var(--accent-coral)]/30 hover:bg-white/40"
                style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
              >{s.category}</span>
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>•</span>
              <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>{s.mode}</span>
            </div>
            {s.id === selId && (
              <span className="mt-1 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest animate-pop-in"
                style={{ background: "var(--accent-coral-soft)", color: "var(--accent-coral)" }}
              >
                selected
              </span>
            )}
          </BlobSection>
        ))}
      </section>

      {/* ═══ DIVIDER ═══ */}
      <div className="editorial-divider mt-8" />

      {/* ═══ VERIFICATION INPUT ═══ */}
      <section className="mt-14 motion-slide-up">
        <h2 className="text-hero">
          The most detailed<br />safety verification
        </h2>

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          {/* Left: inputs */}
          <div className="space-y-6">
            <div className="relative">
              <div className="blob-soft absolute -left-8 -top-8 -z-10 h-48 w-48 opacity-40" />
              <SLabel>User Prompt</SLabel>
              <textarea
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                className="mt-2 min-h-24 w-full rounded-xl border px-4 py-3 text-sm leading-7 outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(212,132,106,0.1)]"
                style={{ borderColor: "var(--border-default)", background: "var(--bg-white)", color: "var(--text-primary)" }}
              />
            </div>
            <div>
              <SLabel>Intercepted Candidate</SLabel>
              <textarea
                value={modelOutput}
                onChange={(e) => setModelOutput(e.target.value)}
                className="mt-2 min-h-28 w-full rounded-xl border px-4 py-3 font-mono text-sm leading-7 outline-none transition-shadow focus:shadow-[0_0_0_3px_rgba(212,132,106,0.1)]"
                style={{ borderColor: "var(--border-default)", background: "var(--bg-white)", color: "var(--text-primary)" }}
              />
            </div>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as SafetyMode)}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium outline-none"
                style={{ borderColor: "var(--border-default)", background: "var(--bg-card)", color: "var(--text-primary)" }}
              >
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
              </select>
              <button
                type="button"
                onClick={() => startTransition(() => { void run(); })}
                disabled={isPending}
                className="relative overflow-hidden rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 hover:shadow-[0_4px_20px_rgba(212,132,106,0.25)] disabled:opacity-50"
                style={{ background: "var(--accent-coral)" }}
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Verifying…
                  </span>
                ) : "Run verification"}
              </button>
              <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest animate-pulse-subtle" style={{ color: "var(--text-faint)" }}>
                <span className="h-1.5 w-1.5 rounded-full motion-glow" style={{ background: "var(--accent-blue)" }} />
                active
              </span>
            </div>
            {error && (
              <div className="rounded-lg border px-4 py-3 text-sm animate-pop-in" style={{ borderColor: "var(--accent-coral)", background: "var(--accent-coral-soft)", color: "var(--text-primary)" }}>
                {error}
              </div>
            )}
          </div>

          {/* Right: code + metrics */}
          <div className="space-y-4">
            <CodeFrame code={modelOutput} title="Code Preview" highlightedLines={hlLines} isScanning={isPending} />
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Domain", val: live.domain },
                { label: "Confidence", val: prettyPercent(report?.confidence ?? live.confidence) },
                { label: "Risk", val: report?.riskLevel ?? live.riskLevel },
              ].map((m, idx) => (
                <div 
                  key={m.label} 
                  className={`rounded-xl border px-3 py-3 text-center interactive-hover-stat motion-card ${isPending ? "animate-pulse-subtle" : ""}`} 
                  style={{ 
                    borderColor: "var(--border-subtle)", 
                    background: "var(--bg-card)",
                    animationDelay: `${idx * 80}ms`
                  }}
                >
                  <SLabel>{m.label}</SLabel>
                  <p className="mt-1 font-serif text-lg transition-transform duration-300 group-hover:scale-105" style={{ color: "var(--text-primary)" }}>{m.val}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ VERDICT ═══ */}
      {report && (
        <>
          <div className="editorial-divider mt-16" />

          {/* Verdict blob section */}
          <section className="mt-14">
            <BlobSection
              number="06"
              reverse={false}
              blobVariant="blob-wide"
              className="motion-slide-up"
              illustration={
                <div className="flex flex-col items-center gap-2 animate-pop-in">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white transition-transform duration-300 hover:rotate-12"
                    style={{ background: vi.color }}
                  >{vi.icon}</div>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                    {report.mode}
                  </span>
                </div>
              }
            >
              <SLabel>Final Verdict</SLabel>
              <h2 className="text-section transition-colors duration-300" style={{ color: vi.color }}>{verdictLabel(report.verdict)}</h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{report.summary}</p>
            </BlobSection>
          </section>

          {/* Proof stats */}
          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { l: "Checksum", v: report.proofArtifact.checksum },
              { l: "Schema", v: report.proofArtifact.schema },
              { l: "AST Nodes", v: report.proofArtifact.astNodeCount },
              { l: "Tokens", v: report.proofArtifact.tokenCount },
            ].map((s, idx) => (
              <div 
                key={s.l} 
                className="rounded-xl border px-4 py-4 interactive-hover-stat motion-card" 
                style={{ 
                  borderColor: "var(--border-subtle)", 
                  background: "var(--bg-card)",
                  animationDelay: `${idx * 60}ms`
                }}
              >
                <SLabel>{s.l}</SLabel>
                <p className="mt-2 break-all font-mono text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                  {s.v ?? "—"}
                </p>
              </div>
            ))}
          </section>

          {/* ═══ DETAIL ACCORDION ═══ */}
          <section className="mt-10 space-y-3">
            {/* Constraints */}
            <Expandable title="Constraint Formulas" badge={`${report.constraints.length}`} expanded={expanded === "c"} onToggle={() => toggle("c")}>
              <div className="space-y-3">
                {report.constraints.map((c) => {
                  const cc = constraintColor(c);
                  return (
                    <div key={c.id} className="rounded-lg border px-4 py-3" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-white)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: cc.dot }} />
                          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.id} · {c.title}</span>
                        </div>
                        <span className={`rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${cc.badge}`}>
                          {c.passed ? "pass" : `fail · ${c.severity}`}
                        </span>
                      </div>
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border px-3 py-2 font-mono text-xs leading-6"
                        style={{ borderColor: "var(--border-subtle)", background: "var(--bg-card)", color: "var(--text-secondary)" }}
                      >{c.formula}</pre>
                    </div>
                  );
                })}
              </div>
            </Expandable>

            {/* Grammar */}
            <Expandable title="Grammar Matrix" expanded={expanded === "g"} onToggle={() => toggle("g")}>
              <p className="mb-4 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{report.grammar.summary}</p>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  { t: "Allowed", items: report.grammar.allowedConstructs, bg: "var(--accent-blue-soft)", text: "var(--text-primary)" },
                  { t: "Blocked", items: report.grammar.blockedConstructs, bg: "var(--accent-coral-soft)", text: "var(--text-primary)" },
                  { t: "Required", items: report.grammar.requiredProperties, bg: "var(--bg-card)", text: "var(--text-primary)" },
                ].map((g) => g.items.length > 0 && (
                  <div key={g.t} className="space-y-1.5">
                    <SLabel>{g.t}</SLabel>
                    {g.items.map((item, j) => (
                      <div key={`${g.t}-${item}`} className="motion-card rounded-md border px-3 py-2 text-sm"
                        style={{ animationDelay: `${j * 50}ms`, background: g.bg, color: g.text, borderColor: "transparent" }}
                      >{item}</div>
                    ))}
                  </div>
                ))}
              </div>
            </Expandable>

            {/* Tokens */}
            <Expandable title="Token Ledger" badge="structural" expanded={expanded === "t"} onToggle={() => toggle("t")}>
              <div className="flex flex-wrap gap-1.5">
                {report.parseArtifact.tokens.slice(0, 30).map((tok, j) => (
                  <span key={tok.id} className={`motion-card rounded-md border px-2 py-1 font-mono text-xs ${
                    tok.blocked ? "border-[var(--accent-coral)]/15 bg-[var(--accent-coral-soft)] text-[var(--text-primary)]" : "border-[var(--border-subtle)] bg-[var(--bg-white)] text-[var(--text-secondary)]"
                  }`} style={{ animationDelay: `${j * 18}ms` }}>
                    {tok.value} <span style={{ color: "var(--text-faint)" }}>L{tok.line}</span>
                  </span>
                ))}
              </div>
            </Expandable>

            {/* AST */}
            <Expandable title="Abstract Syntax Tree" badge="node-linked" expanded={expanded === "a"} onToggle={() => toggle("a")}>
              <p className="mb-3 text-sm" style={{ color: "var(--text-secondary)" }}>{report.parseArtifact.summary}</p>
              <div className="max-h-[28rem] overflow-auto"><AstBranch node={report.parseArtifact.root} /></div>
            </Expandable>

            {/* Violations */}
            <Expandable title="Violation Timeline" expanded={expanded === "v"} onToggle={() => toggle("v")}>
              <div className="relative space-y-3 pl-5">
                <div className="absolute bottom-2 left-[4px] top-2 w-px" style={{ background: "var(--border-default)" }} />
                {(report.violationTrace.length ? report.violationTrace.map((t, i) => ({
                  title: t.message, body: t.excerpt, meta: t.line ? `L${t.line}` : "—", dot: report.verdict === "accept" ? "var(--accent-blue)" : "var(--accent-coral)", i,
                })) : [{ title: "No violations", body: "Candidate satisfies all formulas.", meta: "✓", dot: "var(--accent-blue)", i: 0 }]
                ).map((e) => (
                  <div key={`${e.title}-${e.i}`} className="relative motion-card" style={{ animationDelay: `${e.i * 50}ms` }}>
                    <span className="absolute -left-5 top-3 h-2.5 w-2.5 rounded-full" style={{ background: e.dot, border: "2px solid var(--bg-base)" }} />
                    <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border-subtle)", background: "var(--bg-white)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{e.title}</span>
                        <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>{e.meta}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{e.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Expandable>

            {/* Events */}
            <Expandable title="Event Rail" expanded={expanded === "e"} onToggle={() => toggle("e")}>
              <div className="space-y-2">
                {report.logs.map((l, i) => (
                  <div key={`${l.phase}-${l.message}`} className="motion-card rounded-lg border px-3 py-2.5"
                    style={{ animationDelay: `${i * 40}ms`, borderColor: "var(--border-subtle)", background: "var(--bg-white)" }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{l.phase}</span>
                      <span className={`rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${l.status === "done" ? "bg-[var(--accent-blue-soft)] text-[var(--text-primary)]" : "bg-[var(--bg-card)] text-[var(--text-primary)]"}`}>{l.status}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>{l.message}</p>
                  </div>
                ))}
              </div>
            </Expandable>

            {/* Proof JSON */}
            <Expandable title="Proof JSON" expanded={showJson} onToggle={() => setShowJson((v) => !v)}>
              <pre className="max-h-64 overflow-auto rounded-lg border px-4 py-3 font-mono text-xs leading-6"
                style={{ borderColor: "var(--border-subtle)", background: "var(--bg-white)", color: "var(--text-secondary)" }}
              >{report.rawProofJson}</pre>
            </Expandable>
          </section>

          {/* ═══ REFINEMENT ═══ */}
          {report.refinement && (
            <section className="mt-10">
              <BlobSection number="07" reverse={true} blobVariant="blob-alt"
                className="motion-slide-up"
                illustration={
                  <div className="flex flex-col items-center justify-center">
                    <div
                      className="flex h-16 w-16 items-center justify-center rounded-full animate-spin-slow transition-transform duration-300 hover:scale-110"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid var(--border-default)",
                        boxShadow: "0 12px 28px rgba(0, 0, 0, 0.16), inset 0 0 0 1px rgba(255,255,255,0.02)",
                      }}
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                      </svg>
                    </div>
                  </div>
                }
              >
                <SLabel>Auto-Refinement Loop</SLabel>
                <h3 className="text-section">Suggested Refinement</h3>
                
                <details className="group mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  <summary className="flex cursor-pointer select-none list-none items-center gap-1 font-semibold outline-none transition-colors hover:text-[var(--accent-coral)]">
                    <span className="inline-block transition-transform duration-200 group-open:rotate-90">▸</span>
                    <span>View Prompt Context</span>
                  </summary>
                  <div className="mt-2 border-l-2 pl-3 italic leading-relaxed" style={{ borderColor: "var(--border-default)" }}>
                    &quot;{report.refinement.prompt}&quot;
                  </div>
                </details>

                <div className="space-y-1.5 py-1">
                  {report.refinement.rationale.map((r, i) => (
                    <div key={r} className="motion-card rounded-md border px-3 py-2 text-xs"
                      style={{ animationDelay: `${i * 50}ms`, borderColor: "var(--border-subtle)", background: "var(--bg-white)", color: "var(--text-secondary)" }}
                    >
                      ✓ {r}
                    </div>
                  ))}
                </div>

                <CodeFrame code={report.refinement.candidate} title="Refined Candidate" />

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={refine}
                    className="relative overflow-hidden rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95 hover:shadow-[0_4px_16px_rgba(212,132,106,0.25)]"
                    style={{ background: "var(--accent-coral)" }}
                  >
                    Initiate Refinement
                  </button>
                </div>
              </BlobSection>
            </section>
          )}
        </>
      )}

      {/* ═══ FOOTER ═══ */}
      <footer className="mt-24 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent-coral)" }} />
          <span className="text-[9px] uppercase tracking-[0.3em]" style={{ color: "var(--text-faint)" }}>
            TRUSS · Safety Verification
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-[1px] w-8" style={{ background: "var(--border-default)" }} />
          <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>•</span>
          <div className="h-[1px] w-8" style={{ background: "var(--border-default)" }} />
        </div>
      </footer>
    </div>
  );
}
