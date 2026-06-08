import { GitBranch, Sparkles, Wand2 } from "lucide-react";
import type { Commit } from "@/lib/dpe-data";
import { StatusBadge } from "./StatusBadge";

function CodeBlock({
  title,
  code,
  variant,
}: {
  title: string;
  code: string;
  variant: "before" | "after";
}) {
  const lines = code.split("\n");
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-background/60">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          {variant === "before" ? (
            <Wand2 className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 text-success" />
          )}
          <span className="text-xs font-medium">{title}</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {lines.length} lines
        </span>
      </div>
      <pre className="flex-1 overflow-auto p-0 font-mono text-[12px] leading-[1.55]">
        <code className="block">
          {lines.map((line, i) => (
            <div
              key={i}
              className={
                variant === "before"
                  ? "flex hover:bg-destructive/5"
                  : "flex hover:bg-success/5"
              }
            >
              <span className="w-10 shrink-0 select-none border-r border-border px-2 py-0.5 text-right text-[10px] text-muted-foreground/60">
                {i + 1}
              </span>
              <span
                className={
                  "flex-1 px-3 py-0.5 " +
                  (variant === "before"
                    ? "text-foreground/85"
                    : "text-foreground")
                }
              >
                {line || " "}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function DiffPanel({ commit }: { commit: Commit }) {
  return (
    <div className="surface-card flex h-full flex-col rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Refactor Diff</h2>
            <span className="font-mono text-[11px] text-muted-foreground">#{commit.hash}</span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {commit.title}
          </p>
        </div>
        <StatusBadge status={commit.status} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        <CodeBlock title="Original AI Output" code={commit.original} variant="before" />
        <CodeBlock title="Refactored Modular Code" code={commit.refactored} variant="after" />
      </div>
    </div>
  );
}