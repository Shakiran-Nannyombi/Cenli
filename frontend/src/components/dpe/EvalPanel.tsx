import { Check, Gavel, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { useState } from "react";
import type { Commit } from "@/lib/dpe-data";
import { evaluateCode, type JudgeReport } from "@/lib/api/client";
import { cn } from "@/lib/utils";

function HealthBar({
  label, value, invert = false, tone,
}: { label: string; value: number; invert?: boolean; tone: "primary" | "accent" | "info" | "warning" | "success" | "destructive" }) {
  const score = invert ? 100 - value : value;
  const verdict = score >= 75 ? "Strong" : score >= 50 ? "Acceptable" : "At risk";
  const verdictColor = score >= 75 ? "text-success" : score >= 50 ? "text-warning" : "text-destructive";
  const barClass = {
    primary: "bg-primary", accent: "bg-accent", info: "bg-info",
    warning: "bg-warning", success: "bg-success", destructive: "bg-destructive",
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
        <div className={cn("h-full rounded-full transition-all duration-700", barClass)} style={{ width: `${score}%` }} />
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
  const [judging, setJudging] = useState(false);
  const [liveReport, setLiveReport] = useState<JudgeReport | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);

  // Derive display values — live report overrides commit defaults
  const drift = liveReport
    ? 100 - (liveReport.architectural_drift_risk === "None" ? 90 : liveReport.architectural_drift_risk === "Low" ? 60 : 20)
    : commit.drift;
  const modularity = liveReport
    ? liveReport.modularity_ratio === "Highly Modular" ? 88 : liveReport.modularity_ratio === "Partially Modular" ? 55 : 25
    : commit.modularity;
  const confidence = liveReport ? liveReport.confidence_pct : 88 - (commit.drift / 4 | 0);
  const verdict = liveReport ? liveReport.verdict : (commit.status === "Failed Evaluation" ? "reject" : "approve");
  const isApproved = verdict === "approve";

  async function runLiveEval() {
    if (!commit.original || !commit.refactored) return;
    setJudging(true);
    setJudgeError(null);
    setLiveReport(null);
    try {
      const report = await evaluateCode(commit.original, commit.refactored);
      if (report.error) {
        setJudgeError(report.error);
      } else {
        setLiveReport(report);
        // Auto-update commit status based on real verdict
        if (report.verdict === "approve") onApprove();
        else onReject();
      }
    } catch (err) {
      setJudgeError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setJudging(false);
    }
  }

  return (
    <div className="surface-card flex h-full flex-col rounded-xl border border-border">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-warning" />
          <h2 className="text-sm font-semibold tracking-tight">LLM-as-Judge · Audit</h2>
          {liveReport && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ring-1 ring-inset ring-primary/20">
              <Sparkles className="h-2.5 w-2.5" /> Live
            </span>
          )}
        </div>
        <button
          onClick={runLiveEval}
          disabled={judging}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:opacity-50"
        >
          {judging ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {judging ? "Evaluating…" : "Run Live Eval"}
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Error state */}
        {judgeError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            {judgeError}
          </div>
        )}

        {/* Live judge summary */}
        {liveReport?.summary && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground italic">
            "{liveReport.summary}"
          </div>
        )}

        {/* Score cards */}
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              k: "Verdict",
              v: isApproved ? "Approve" : "Reject",
              tone: isApproved ? "text-success" : "text-destructive",
            },
            {
              k: "Debt Δ",
              v: liveReport ? `${liveReport.technical_debt_reduction_percentage}%` : "—",
              tone: "text-foreground",
            },
            {
              k: "Confidence",
              v: `${confidence}%`,
              tone: "text-primary",
            },
          ].map((s) => (
            <div key={s.k} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.k}</div>
              <div className={cn("mt-1 text-lg font-semibold", s.tone)}>{s.v}</div>
            </div>
          ))}
        </div>

        {/* Complexity badge from live report */}
        {liveReport && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>Complexity:</span>
            <span className={cn("font-semibold", {
              "text-success": liveReport.cyclomatic_complexity === "Low",
              "text-warning": liveReport.cyclomatic_complexity === "Medium",
              "text-destructive": liveReport.cyclomatic_complexity === "High",
            })}>
              {liveReport.cyclomatic_complexity}
            </span>
            <span className="mx-1">·</span>
            <span>Modularity:</span>
            <span className="font-semibold text-primary">{liveReport.modularity_ratio}</span>
          </div>
        )}

        {/* Health bars */}
        <div className="space-y-3">
          <HealthBar label="Architectural Drift" value={drift} invert tone="accent" />
          <HealthBar label="Modularity Ratio" value={modularity} tone="primary" />
          <HealthBar label="Regression Risk" value={commit.regression} invert tone="warning" />
        </div>

        {/* Volume chart */}
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

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
        <button
          onClick={onApprove}
          disabled={judging}
          className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-success/15 px-3 py-2 text-xs font-semibold text-success ring-1 ring-inset ring-success/30 transition-all hover:bg-success hover:text-success-foreground disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
          Approve &amp; Merge
        </button>
        <button
          onClick={onReject}
          disabled={judging}
          className="group inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive ring-1 ring-inset ring-destructive/30 transition-all hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Reject
          <RotateCcw className="h-3 w-3 opacity-70 transition-transform group-hover:rotate-180" />
        </button>
      </div>
    </div>
  );
}
