import { createFileRoute } from "@tanstack/react-router";
import { Activity, Cpu, Database, Timer } from "lucide-react";
import { TraceView } from "@/components/dpe/TraceView";
import { RequireAuth } from "@/lib/auth";

export const Route = createFileRoute("/telemetry")({
  head: () => ({
    meta: [
      { title: "Telemetry — Cenli DPE" },
      { name: "description", content: "Live nested trace spans for agent loops, MCP tool calls and self-correction passes — with token throughput, p95 latency and cache hit rate." },
      { property: "og:title", content: "Telemetry — Cenli DPE" },
      { property: "og:description", content: "Phoenix-grade telemetry for every AI agent loop, tool call and refactor span." },
    ],
  }),
  component: () => (<RequireAuth><TelemetryPage /></RequireAuth>),
});

const SPARK = [22, 28, 18, 34, 30, 42, 36, 48, 40, 55, 50, 62, 58, 70, 64, 72];

function spark(values: number[]) {
  const w = 160, h = 36, max = Math.max(...values);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        points={pts}
        fill="none"
        stroke="oklch(0.74 0.17 175)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatCard({ icon: Icon, label, value, suffix, tone }: {
  icon: typeof Activity; label: string; value: string; suffix?: string; tone: string;
}) {
  return (
    <div className="surface-card rounded-xl border border-border p-4">
      <div className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider ${tone}`}>
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </div>
      <div className="mt-2">{spark(SPARK)}</div>
    </div>
  );
}

function TelemetryPage() {
  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Telemetry</h1>
        <p className="text-sm text-muted-foreground">
          Live span introspection across agent loops, MCP tool calls and sub-agent self-correction passes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard icon={Activity} label="Spans / min" value="4,182" tone="text-primary" />
        <StatCard icon={Timer} label="p95 latency" value="1.24" suffix="s" tone="text-info" />
        <StatCard icon={Cpu} label="Token throughput" value="84.6k" suffix="tok/s" tone="text-accent" />
        <StatCard icon={Database} label="MCP cache hit" value="92.4" suffix="%" tone="text-success" />
      </div>

      <section className="h-[520px]">
        <TraceView />
      </section>
    </main>
  );
}