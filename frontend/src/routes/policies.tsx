import { createFileRoute } from "@tanstack/react-router";
import { Check, FileLock2, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { RequireAuth } from "@/lib/auth";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "Policies — Cenli DPE" },
      { name: "description", content: "Configurable strict-modular guardrails — complexity, drift, duplication and secret-scanning rules enforced on every AI commit before merge." },
      { property: "og:title", content: "Policies — Cenli DPE" },
      { property: "og:description", content: "Strict-modular policy catalog enforced on every AI-generated commit before main." },
    ],
  }),
  component: () => (<RequireAuth><PoliciesPage /></RequireAuth>),
});

const POLICIES = [
  { id: "P-001", name: "Max cyclomatic complexity per function", value: "≤ 10", severity: "block", enabled: true },
  { id: "P-002", name: "Forbid duplicated logic across modules", value: "Jaccard ≥ 0.85", severity: "block", enabled: true },
  { id: "P-003", name: "Required test coverage on refactored paths", value: "≥ 80%", severity: "warn", enabled: true },
  { id: "P-004", name: "Reject inline secrets / API keys", value: "regex + entropy", severity: "block", enabled: true },
  { id: "P-005", name: "Limit function length", value: "≤ 60 LOC", severity: "warn", enabled: true },
  { id: "P-006", name: "Architectural drift threshold", value: "Δ ≤ 0.25", severity: "block", enabled: true },
  { id: "P-007", name: "Require module boundary imports", value: "no cross-feature", severity: "warn", enabled: false },
  { id: "P-008", name: "Forbid unbounded recursion in agent loops", value: "depth ≤ 6", severity: "block", enabled: true },
];

function SeverityChip({ s }: { s: string }) {
  const block = s === "block";
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ring-inset",
      block
        ? "bg-destructive/10 text-destructive ring-destructive/30"
        : "bg-warning/10 text-warning ring-warning/30",
    )}>
      {block ? <ShieldAlert className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
      {s}
    </span>
  );
}

function PoliciesPage() {
  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Policies</h1>
          <p className="text-sm text-muted-foreground">
            Guardrails enforced on every AI-generated commit before it can be merged.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-3 py-1.5">
          <FileLock2 className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[11px]">policy bundle</span>
          <span className="font-mono text-[11px] text-primary">strict-modular-v4</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { k: "Active policies", v: "7 / 8", tone: "text-primary" },
          { k: "Block-level", v: "5", tone: "text-destructive" },
          { k: "Warn-level", v: "2", tone: "text-warning" },
          { k: "Avg. violations / 24h", v: "12.4", tone: "text-info" },
        ].map((s) => (
          <div key={s.k} className="surface-card rounded-xl border border-border p-4">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
            <div className={cn("mt-1 text-2xl font-semibold", s.tone)}>{s.v}</div>
          </div>
        ))}
      </div>

      <section className="surface-card overflow-hidden rounded-xl border border-border">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold tracking-tight">
          Policy Catalog
        </div>
        <ul className="divide-y divide-border">
          {POLICIES.map((p) => (
            <li key={p.id} className="grid grid-cols-[80px_1fr_auto_auto_auto] items-center gap-4 px-4 py-3">
              <span className="font-mono text-[11px] text-muted-foreground">{p.id}</span>
              <div>
                <div className="text-sm font-medium">{p.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{p.value}</div>
              </div>
              <SeverityChip s={p.severity} />
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                p.enabled
                  ? "bg-success/10 text-success ring-success/30"
                  : "bg-muted text-muted-foreground ring-border",
              )}>
                {p.enabled && <Check className="h-3 w-3" />}
                {p.enabled ? "enabled" : "disabled"}
              </span>
              <button className="rounded-md border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
                Configure
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}