import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Cenli DPE" },
      { name: "description", content: "Why Cenli exists: containing the architectural cost of generative-AI code at scale." },
      { property: "og:title", content: "About — Cenli DPE" },
      { property: "og:description", content: "Why Cenli exists: containing the architectural cost of generative-AI code at scale." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <main className="mx-auto max-w-[860px] px-6 py-20">
      <div className="font-mono text-[10px] uppercase tracking-wider text-primary">about</div>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
        The control plane for AI-generated code.
      </h1>
      <p className="mt-6 text-base leading-relaxed text-muted-foreground">
        Generative coding agents are landing commits faster than any review process was
        designed for. The result is a slow drift: duplicated abstractions, ballooning
        cyclomatic complexity, and silent regressions that surface weeks later as
        incidents. Cenli is the developer productivity engineering layer that closes
        that loop.
      </p>

      <div className="mt-12 grid gap-6 md:grid-cols-2">
        {[
          { h: "Mission", b: "Make AI-authored code observable, auditable and architecturally sound — by default, not by exception." },
          { h: "Approach", b: "Treat every codegen agent as a first-class service: traced, evaluated, scored and gated against a deterministic policy." },
          { h: "Telemetry", b: "Phoenix-style trace spans for agent loops + tool calls, with token-level cost and latency attribution." },
          { h: "Governance", b: "LLM-as-a-judge evaluations across modularity, drift and regression — with explicit human override and audit trail." },
        ].map((c) => (
          <div key={c.h} className="rounded-lg border border-border bg-background/40 p-5">
            <div className="text-sm font-semibold text-foreground">{c.h}</div>
            <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{c.b}</div>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-xl border border-border bg-background/40 p-6">
        <div className="text-sm font-semibold">Ready to gate your first agent?</div>
        <p className="mt-1 text-xs text-muted-foreground">Sign in to open the live pipeline.</p>
        <Link
          to="/auth"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Continue <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </main>
  );
}