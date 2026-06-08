import { Activity, FileCode2 } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Commit } from "@/lib/dpe-data";
import { cn } from "@/lib/utils";

const LANG_COLOR: Record<Commit["language"], string> = {
  TypeScript: "bg-info",
  Python: "bg-warning",
  Go: "bg-primary",
  Rust: "bg-destructive",
  Java: "bg-accent",
};

export function PipelineFeed({
  commits,
  selectedId,
  onSelect,
}: {
  commits: Commit[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="surface-card flex h-full flex-col rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold tracking-tight">Pipeline Ingestion Feed</h2>
          <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success ring-1 ring-inset ring-success/30">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-success" /> LIVE
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground">{commits.length} commits</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ul className="divide-y divide-border">
          {commits.map((c) => {
            const active = c.id === selectedId;
            return (
              <li
                key={c.id}
                onClick={() => onSelect(c.id)}
                className={cn(
                  "group relative cursor-pointer px-4 py-3 transition-all animate-slide-in-up",
                  active ? "bg-primary/5" : "hover:bg-muted/40"
                )}
              >
                {active && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" />}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileCode2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="font-mono text-[11px] text-muted-foreground">#{c.hash}</span>
                      <span className={cn("h-1.5 w-1.5 rounded-full", LANG_COLOR[c.language])} />
                      <span className="text-[11px] text-muted-foreground">{c.language}</span>
                      <span className="text-[11px] text-muted-foreground">·</span>
                      <span className="font-mono text-[11px] text-muted-foreground">+{c.loc} LOC</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium text-foreground">{c.title}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {c.author} · {c.model}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}