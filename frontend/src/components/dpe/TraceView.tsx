import { ChevronDown, Cpu, Database, Network, ScanEye, Workflow } from "lucide-react";
import type { TraceSpan } from "@/lib/dpe-data";
import { sampleTrace } from "@/lib/dpe-data";
import { useState } from "react";
import { cn } from "@/lib/utils";

const KIND_META = {
  agent:     { icon: Workflow, color: "text-primary",  bar: "bg-primary" },
  llm:       { icon: Cpu,      color: "text-accent",   bar: "bg-accent" },
  tool:      { icon: Network,  color: "text-info",     bar: "bg-info" },
  retriever: { icon: Database, color: "text-warning",  bar: "bg-warning" },
  eval:      { icon: ScanEye,  color: "text-success",  bar: "bg-success" },
} as const;

const STATUS_DOT = {
  ok:    "bg-success",
  warn:  "bg-warning",
  error: "bg-destructive",
} as const;

function Span({
  span,
  total,
  depth = 0,
  offset = 0,
}: {
  span: TraceSpan;
  total: number;
  depth?: number;
  offset?: number;
}) {
  const [open, setOpen] = useState(true);
  const meta = KIND_META[span.kind];
  const Icon = meta.icon;
  const width = (span.ms / total) * 100;
  const left = (offset / total) * 100;
  const hasKids = !!span.children?.length;

  return (
    <div className="text-[12px]">
      <div
        className={cn(
          "group grid grid-cols-[minmax(220px,1fr)_minmax(0,2fr)_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/40",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 14 }}>
          {hasKids ? (
            <button
              onClick={() => setOpen((v) => !v)}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
            </button>
          ) : (
            <span className="w-3" />
          )}
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
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {span.ms} ms
        </span>
      </div>
      {span.attrs && (
        <div
          className="ml-1 flex flex-wrap gap-1 pb-1 pl-7"
          style={{ paddingLeft: depth * 14 + 28 }}
        >
          {Object.entries(span.attrs).map(([k, v]) => (
            <span
              key={k}
              className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
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
              const node = (
                <Span key={i} span={child} total={total} depth={depth + 1} offset={acc} />
              );
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
  const total = sampleTrace.ms;
  return (
    <div className="surface-card flex h-full flex-col rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <ScanEye className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold tracking-tight">Phoenix Tracing — Introspection</h2>
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent ring-1 ring-inset ring-accent/30">
            session sess_8af2
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">
          total {total} ms · 4 child spans
        </span>
      </div>
      <div className="flex-1 overflow-auto px-3 py-2">
        <Span span={sampleTrace} total={total} />
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