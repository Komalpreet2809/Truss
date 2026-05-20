import { VerificationWorkspace } from "@/components/verification-workspace";

export default function Home() {
  return (
    <main className="relative isolate flex-1 overflow-hidden">
      {/* Decorative coral circle — top right */}
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-30 motion-float-slow"
        style={{ background: "var(--accent-coral)" }}
      />
      <div className="relative z-10">
        <VerificationWorkspace />
      </div>
    </main>
  );
}
