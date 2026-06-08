import { createFileRoute } from "@tanstack/react-router";
import { Bot, Cpu, GitMerge, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { RequireAuth } from "@/lib/auth";

export const Route = createFileRoute("/agents")({
  head: () => ({
    meta: [
      { title: "Agents — Cenli DPE" },
      { name: "description", content: "Registry of every autonomous codegen and judge agent — merge rate, reject rate, drift score and token economics in one view." },
      { property: "og:title", content: "Agents — Cenli DPE" },
      { property: "og:description", content: "Track merge rate, throughput and policy compliance for every registered AI coding agent." },
    ],
  }),
  component: () => (<RequireAuth><AgentsPage /></RequireAuth>),
});

const AGENTS = [
  { name: "agent.sonnet", model: "claude-sonnet-4.5", role: "Refactor planner", merged: 412, rejected: 18, drift: 12, online: true },
  { name: "agent.gpt5",   model: "gpt-5-codex",       role: "Critique pass",    merged: 298, rejected: 22, drift: 19, online: true },
  { name: "agent.codex",  model: "deepseek-coder-v3", role: "Patch synthesizer", merged: 184, rejected: 31, drift: 24, online: true },
  { name: "agent.gemini", model: "gemini-2.5-pro",   role: "Test generator",    merged: 96,  rejected: 9,  drift: 8,  online: false },
  { name: "agent.opus",   model: "claude-opus-4",    role: "LLM-as-judge",      merged: 0,   rejected: 0,  drift: 0,  online: true },
];

function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
      <div className={cn("h-full rounded-full transition-all", tone)} style={{ width: `${(value / max) * 100}%` }} />
    </div>
  );
}

function AgentsPage() {
  const maxMerged = Math.max(...AGENTS.map((a) => a.merged), 1);
  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Agents</h1>
        <p className="text-sm text-muted-foreground">
          Autonomous refactor and evaluation agents currently registered with the orchestrator.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { icon: Bot, label: "Active agents", value: "4 / 5", tone: "text-primary" },
          { icon: GitMerge, label: "Merges / 24h", value: "164", tone: "text-success" },
          { icon: ShieldCheck, label: "Reject rate", value: "8.2%", tone: "text-warning" },
          { icon: Cpu, label: "Avg. tokens / patch", value: "3.4k", tone: "text-accent" },
        ].map((s) => (
          <div key={s.label} className="surface-card rounded-xl border border-border p-4">
            <div className={cn("flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider", s.tone)}>
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight">{s.value}</div>
          </div>
        ))}
      </div>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {AGENTS.map((a) => (
          <article
            key={a.name}
            className="surface-card rounded-xl border border-border p-4 transition-colors hover:border-primary/30"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-primary/30 to-accent/30 ring-1 ring-inset ring-primary/20">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{a.name}</h2>
                  <div className="font-mono text-[11px] text-muted-foreground">{a.model}</div>
                </div>
              </div>
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
                a.online
                  ? "bg-success/10 text-success ring-success/30"
                  : "bg-muted text-muted-foreground ring-border",
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", a.online ? "animate-pulse-dot bg-success" : "bg-muted-foreground")} />
                {a.online ? "online" : "offline"}
              </span>
            </div>

            <div className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">{a.role}</div>

            <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Merged</dt>
                <dd className="font-mono text-base">{a.merged}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Rejected</dt>
                <dd className="font-mono text-base text-destructive">{a.rejected}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">Drift</dt>
                <dd className="font-mono text-base text-warning">{a.drift}</dd>
              </div>
            </dl>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Merge throughput</span>
                <span className="font-mono">{Math.round((a.merged / maxMerged) * 100)}%</span>
              </div>
              <Bar value={a.merged} max={maxMerged} tone="bg-gradient-to-r from-primary to-accent" />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}