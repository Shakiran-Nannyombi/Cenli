import { ChevronDown, Cpu, Database, Loader2, Network, RefreshCw, ScanEye, Workflow } from "lucide-react";
import type { TraceSpan } from "@/lib/dpe-data";
import { sampleTrace } from "@/lib/dpe-data";
import { useEffect, useState } from "react";
import { getTraces } from "@/lib/api/client";
import { cn } from "@/lib/utils";

const KIND_META = {
  agent: { icon: Workflow, color: "text-primary", bar: "bg-primary" },
  llm: { icon: Cpu, color: "text-accent", bar: "bg-accent" },
  tool: { icon: Network, color: "text-info", bar: "bg-info" },
  retriever: { icon: Database, color: "text-warning", bar: "bg-warning" },
  eval: { icon: ScanEye, color: "text-success", bar: "bg-success" },
} as const;

const STATUS_DOT = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-destructive",
} as const;

function Span({ span, total, depth = 0, offset = 0 }: {
  span: TraceSpan; total: number; depth?: number; offset?: number;
}) {
  const [open, setOpen] = useState(true);
  const meta = KIND_META[span.kind];
  const Icon = meta.icon;
  const width = (span.ms / total) * 100;
  const left = (offset / total) * 100;
  const hasKids = !!span.children?.length;

  return (
    <div className="text-[12px]">
      <div className="group grid grid-cols-[minmax(220px,1fr)_minmax(0,2fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40">
        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
          {hasKids ? (
            <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground">
              <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
            </button>
          ) : <span className="w-3" />}
          <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOT[span.status])} />
          <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.color)} />
          <span className="truncate font-mono">{span.name}</span>
        </div>
        <div className="relative h-2.5 rounded-full bg-muted/40">
          <div
            className={cn("absolute top-0 h-2.5 rounded-full opacity-90", meta.bar)}
            style={{ left: `${left}%`, width: `${Math.max(width, 1.2)}%` }}
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{span.ms} ms</span>
      </div>
      {span.attrs && (
        <div className="ml-1 flex flex-wrap gap-1 pb-1" style={{ paddingLeft: depth * 14 + 28 }}>
          {Object.entries(span.attrs).map(([k, v]) => (
            <span key={k} className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {k}=<span className="text-foreground/80">{String(v)}</span>
            </span>
          ))}
        </div>
      )}
      {hasKids && open && (
        <div>
          {(() => {
            let acc = offset;
            return span.children!.map((child, i) => {
              const node = <Span key={i} span={child} total={total} depth={depth + 1} offset={acc} />;
              acc += child.ms;
              return node;
            });
          })()}
        </div>
      )}
    </div>
  );
}

export function TraceView() {
  const [trace, setTrace] = useState<TraceSpan>(sampleTrace);
  const [sessionId, setSessionId] = useState("sample");
  const [loading, setLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  async function fetchLiveTraces() {
    setLoading(true);
    try {
      const data = await getTraces(5) as any;
      // Phoenix returns traces in various shapes — try to extract first trace
      const traces = data?.data ?? data?.traces ?? data ?? [];
      if (Array.isArray(traces) && traces.length > 0) {
        const first = traces[0];
        // Map Phoenix trace format to our TraceSpan shape
        const rootSpan: TraceSpan = {
          name: first.name ?? first.rootSpanName ?? "dpe.pipeline",
          kind: "agent",
          ms: first.latencyMs ?? first.durationMs ?? Math.round((first.endTime - first.startTime) / 1e6) ?? sampleTrace.ms,
          status: first.statusCode === "ERROR" ? "error" : "ok",
          attrs: first.attributes ?? { trace_id: first.traceId ?? "live" },
          children: [],
        };
        setTrace(rootSpan);
        setSessionId(first.traceId?.slice(0, 8) ?? "live");
        setIsLive(true);
      }
    } catch {
      // Backend not reachable or Phoenix has no traces yet — stay on sample
    } finally {
      setLoading(false);
    }
  }

  // Try to load live traces on mount
  useEffect(() => { fetchLiveTraces(); }, []);

  const total = trace.ms;

  return (
    <div className="surface-card flex h-full flex-col rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanEye className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold tracking-tight">Phoenix Tracing — Introspection</h2>
          <span className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset",
            isLive
              ? "bg-primary/10 text-primary ring-primary/20"
              : "bg-accent/10 text-accent ring-accent/30"
          )}>
            {isLive ? "live" : "sample"} · {sessionId}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {total} ms
          </span>
          <button
            onClick={fetchLiveTraces}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2">
        <Span span={trace} total={total} />
      </div>
      <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {(["agent", "llm", "tool", "retriever", "eval"] as const).map((k) => {
          const m = KIND_META[k];
          const Icon = m.icon;
          return (
            <div key={k} className="flex items-center gap-1.5">
              <Icon className={cn("h-3 w-3", m.color)} />
              <span>{k}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
