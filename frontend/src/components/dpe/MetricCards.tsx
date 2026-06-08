import { Activity, Gauge, Timer, TrendingDown } from "lucide-react";
import type { Commit } from "@/lib/dpe-data";
import { cn } from "@/lib/utils";

function Ring({ value, color }: { value: number; color: string }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" className="-rotate-90">
      <circle cx="30" cy="30" r={r} stroke="currentColor" strokeOpacity="0.12" strokeWidth="5" fill="none" />
      <circle
        cx="30" cy="30" r={r}
        stroke={color}
        strokeWidth="5"
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.2,0.8,0.2,1)" }}
      />
    </svg>
  );
}

export function MetricCards({ commit }: { commit: Commit }) {
  const debtHealth = 100 - commit.techDebt;
  const complexityColor =
    commit.complexity === "High" ? "text-destructive" :
    commit.complexity === "Medium" ? "text-warning" : "text-success";

  const cards = [
    {
      label: "Technical Debt Score",
      value: `${debtHealth}`,
      suffix: "/100",
      delta: "−12% vs baseline",
      ring: <Ring value={debtHealth} color="oklch(0.74 0.17 175)" />,
      icon: <TrendingDown className="h-3.5 w-3.5" />,
      tone: "text-primary",
    },
    {
      label: "Cyclomatic Complexity",
      value: commit.complexity,
      suffix: "",
      delta: `${commit.complexity === "High" ? "Above" : "Within"} threshold`,
      ring: (
        <Ring
          value={commit.complexity === "High" ? 88 : commit.complexity === "Medium" ? 55 : 28}
          color={
            commit.complexity === "High" ? "oklch(0.65 0.24 25)" :
            commit.complexity === "Medium" ? "oklch(0.82 0.17 80)" :
            "oklch(0.74 0.17 155)"
          }
        />
      ),
      icon: <Gauge className="h-3.5 w-3.5" />,
      tone: complexityColor,
    },
    {
      label: "Execution Latency",
      value: commit.latencyMs.toLocaleString(),
      suffix: " ms",
      delta: `p95 span across ${Math.ceil(commit.latencyMs / 250)} segments`,
      ring: <Ring value={Math.min(100, commit.latencyMs / 25)} color="oklch(0.72 0.16 235)" />,
      icon: <Timer className="h-3.5 w-3.5" />,
      tone: "text-info",
    },
    {
      label: "Token Throughput",
      value: commit.tokens.toLocaleString(),
      suffix: " tok",
      delta: `${Math.round(commit.tokens / (commit.latencyMs / 1000))} tok/s`,
      ring: <Ring value={Math.min(100, commit.tokens / 100)} color="oklch(0.65 0.22 295)" />,
      icon: <Activity className="h-3.5 w-3.5" />,
      tone: "text-accent",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="surface-card group relative overflow-hidden rounded-xl border border-border p-4 transition-colors hover:border-primary/30"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className={cn("flex items-center gap-1.5 text-[11px] font-medium", c.tone)}>
                {c.icon}
                <span className="uppercase tracking-wider">{c.label}</span>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">{c.value}</span>
                <span className="text-sm text-muted-foreground">{c.suffix}</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{c.delta}</p>
            </div>
            <div className={c.tone}>{c.ring}</div>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px scan-line opacity-60" />
        </div>
      ))}
    </div>
  );
}