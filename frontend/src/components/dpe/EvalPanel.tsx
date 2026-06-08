import { Check, Gavel, RotateCcw, X } from "lucide-react";
import type { Commit } from "@/lib/dpe-data";
import { cn } from "@/lib/utils";

function HealthBar({
  label, value, invert = false, tone,
}: { label: string; value: number; invert?: boolean; tone: "primary" | "accent" | "info" | "warning" | "success" | "destructive" }) {
  const score = invert ? 100 - value : value;
  const verdict = score >= 75 ? "Strong" : score >= 50 ? "Acceptable" : "At risk";
  const verdictColor = score >= 75 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";
  const barClass = {
    primary: "bg-primary",
    accent: "bg-accent",
    info: "bg-info",
    warning: "bg-warning",
    success: "bg-success",
    destructive: "bg-destructive",
  }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn("font-mono", verdictColor)}>{verdict}</span>
          <span className="font-mono tabular-nums">{score}</span>
        </div>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-muted/40">
        <div
          className={cn("h-full rounded-full transition-all duration-700", barClass)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

const VOLUME = [12, 18, 9, 22, 30, 25, 14, 28, 36, 19, 24, 31, 20, 16, 26];

export function EvalPanel({
  commit,
  onApprove,
  onReject,
}: {
  commit: Commit;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="surface-card flex h-full flex-col rounded-xl border border-border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold tracking-tight">LLM-as-Judge · Audit</h2>
        </div>
        <span className="rounded-full bg-warning/10 px-2 py-0.5 font-mono text-[10px] text-warning ring-1 ring-inset ring-warning/30">
          rubric v3.2
        </span>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { k: "Verdict", v: commit.status === "Failed Evaluation" ? "Reject" : "Approve", tone: commit.status === "Failed Evaluation" ? "text-destructive" : "text-success" },
            { k: "Passes", v: "3 / 3" , tone: "text-foreground" },
            { k: "Confidence", v: `${88 - commit.drift / 4 | 0}%`, tone: "text-primary" },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
              <div className={cn("mt-1 text-lg font-semibold", s.tone)}>{s.v}</div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <HealthBar label="Architectural Drift" value={commit.drift} invert tone="accent" />
          <HealthBar label="Modularity Ratio" value={commit.modularity} tone="primary" />
          <HealthBar label="Regression Risk" value={commit.regression} invert tone="warning" />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="font-medium">Evaluation Volume · 24h</span>
            <span className="font-mono">peak 36</span>
          </div>
          <div className="flex h-20 items-end gap-1">
            {VOLUME.map((v, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-gradient-to-t from-primary/40 to-accent/70 transition-all hover:from-primary hover:to-accent"
                style={{ height: `${(v / 36) * 100}%` }}
                title={`${v} evals`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <button
          onClick={onApprove}
          className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-success/15 px-3 py-2 text-xs font-semibold text-success ring-1 ring-inset ring-success/30 transition-all hover:bg-success hover:text-success-foreground hover:glow-primary"
        >
          <Check className="h-3.5 w-3.5" />
          Approve &amp; Merge Refactor
        </button>
        <button
          onClick={onReject}
          className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 transition-all hover:bg-destructive hover:text-destructive-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Reject &amp; Re-evaluate
          <RotateCcw className="h-3 w-3 opacity-70 transition-transform group-hover:rotate-180" />
        </button>
      </div>
    </div>
  );
}