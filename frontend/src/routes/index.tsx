import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Activity,
  GitPullRequestArrow,
  ShieldCheck,
  Sparkles,
  Cpu,
  LineChart,
  ArrowUpRight,
  Layers,
  Code2,
  Fingerprint,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cenli DPE — Ship AI code without the debt" },
      { name: "description", content: "Cenli is the developer productivity engineering platform that audits, refactors and gates AI-generated code before it hits main." },
      { property: "og:title", content: "Cenli DPE — Ship AI code without the debt" },
      { property: "og:description", content: "Pipeline ingestion, telemetry traces and LLM-as-judge evaluations for AI-generated commits." },
    ],
  }),
  component: HomePage,
});

const FEATURES = [
  { icon: GitPullRequestArrow, title: "Pipeline ingestion", body: "Stream every AI-authored PR through a deterministic refactor + lint pipeline." },
  { icon: Activity, title: "Phoenix-grade telemetry", body: "Nested trace spans for agent loops, tool calls and token-level cost attribution." },
  { icon: ShieldCheck, title: "LLM-as-a-judge", body: "Architectural-drift, regression and modularity scores with human-in-the-loop override." },
  { icon: Cpu, title: "Agent registry", body: "Track merge rate, throughput and policy compliance across every registered codegen agent." },
  { icon: LineChart, title: "Debt telemetry", body: "Live cyclomatic, Jaccard-similarity and complexity scoring per commit." },
  { icon: Sparkles, title: "Policy guardrails", body: "Strict-modular-v4 ruleset with per-repo overrides and zero-trust enforcement." },
];

const HOW_IT_WORKS = [
  { num: "01", title: "Ingest", icon: Layers, desc: "Every AI-generated commit is intercepted before it reaches main, parsed and tagged with its originating agent." },
  { num: "02", title: "Trace", icon: Fingerprint, desc: "Nested telemetry captures each tool call, reasoning step and token burn with sub-second resolution." },
  { num: "03", title: "Evaluate", icon: Code2, desc: "Modularity, drift and regression scores are computed by an LLM judge against your repo's policy." },
];

function HomePage() {
  const { user } = useAuth();
  return (
    <main className="relative flex-1 overflow-hidden">
      {/* Subtle animated grid background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />
        <div className="absolute inset-x-0 top-0 h-[700px] bg-[radial-gradient(ellipse_at_top,oklch(0.74_0.17_175/0.10),transparent_55%)]" />
        <div className="absolute right-0 top-0 h-[600px] w-[600px] bg-[radial-gradient(circle_at_top_right,oklch(0.65_0.22_295/0.06),transparent_50%)]" />
      </div>

      {/* Hero */}
      <section className="relative mx-auto max-w-[1200px] px-6 pb-20 pt-32 text-center md:pt-40">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
          v4.2 — strict-modular policy live
        </div>

        <h1 className="mx-auto max-w-4xl text-balance text-5xl font-semibold tracking-tight leading-[1.1] md:text-7xl">
          Ship AI-generated code{" "}
          <span className="text-gradient-primary">without the debt</span>.
        </h1>

        <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
          Cenli sits between your codegen agents and main. Every commit is traced,
          refactored, evaluated and gated — so velocity doesn't cost you architecture.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            to={user ? "/dashboard" : "/auth"}
            className="group inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_0_32px_oklch(0.74_0.17_175/0.30)] transition-all hover:bg-primary/90 hover:shadow-[0_0_40px_oklch(0.74_0.17_175/0.45)]"
          >
            {user ? "Open dashboard" : "Get started free"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/about"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/30 px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-muted/40"
          >
            See how Cenli works
          </Link>
        </div>

        {/* Stats ribbon */}
        <div className="mx-auto mt-20 max-w-4xl">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
            {[
              { k: "97.4%", v: "merge-ready rate" },
              { k: "1.2s", v: "p95 eval latency" },
              { k: "−38%", v: "tech debt delta" },
              { k: "24/7", v: "agent observability" },
            ].map((s, i) => (
              <div
                key={s.v}
                className="bg-background/80 p-5 text-center backdrop-blur-sm"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="font-mono text-2xl font-semibold text-foreground md:text-3xl">{s.k}</div>
                <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — creative step flow */}
      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="mb-12 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-primary">workflow</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">From agent to main — controlled.</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.num}
              className="group relative overflow-hidden rounded-2xl border border-border bg-background/40 p-6 transition-colors hover:border-primary/30"
            >
              <div className="absolute right-4 top-4 font-mono text-5xl font-bold text-foreground/[0.04] transition-colors group-hover:text-primary/10">
                {step.num}
              </div>
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-primary">
                <step.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.desc}</p>
              {i < HOW_IT_WORKS.length - 1 && (
                <div className="absolute -right-3 top-1/2 hidden -translate-y-1/2 md:block">
                  <ArrowRight className="h-4 w-4 text-border" />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Features grid */}
      <section className="mx-auto max-w-[1200px] px-6 py-24">
        <div className="mb-12 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-primary">platform</div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Built for AI-native engineering orgs</h2>
          </div>
          <Link
            to="/about"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Read the architecture <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-xl border border-border bg-background/30 p-6 transition-all hover:border-primary/30 hover:bg-background/50"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-primary transition-colors group-hover:bg-primary/10">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold text-foreground">{f.title}</div>
              <div className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Minimal trust strip */}
      <section className="mx-auto max-w-[1200px] px-6 py-16">
        <div className="rounded-2xl border border-border bg-background/30 p-8 text-center backdrop-blur-sm md:p-12">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Trusted by fast-moving engineering teams
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-10 gap-y-5 text-muted-foreground/40">
            {["Linear", "Vercel", "Notion", "Figma", "Raycast", "Supabase"].map((name) => (
              <span key={name} className="text-lg font-semibold tracking-tight">
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-[1200px] px-6 pb-24 pt-8">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-background/40 p-10 text-center md:p-16">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.74_0.17_175/0.08),transparent_70%)]" />
          <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Ready to gate your first agent?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
            Join teams that ship AI code at velocity without architectural drift. Start free, scale when you're ready.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Link
              to={user ? "/dashboard" : "/auth"}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-[0_0_32px_oklch(0.74_0.17_175/0.30)] transition-all hover:bg-primary/90"
            >
              {user ? "Open dashboard" : "Start for free"} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/about"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background/40 px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
            >
              Explore the platform
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
