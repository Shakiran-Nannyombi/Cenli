import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { initialCommits, makeCommit, type Commit, type CommitStatus } from "@/lib/dpe-data";
import { submitPipeline } from "@/lib/api/client";
import { PipelineFeed } from "@/components/dpe/PipelineFeed";
import { DiffPanel } from "@/components/dpe/DiffPanel";
import { MetricCards } from "@/components/dpe/MetricCards";
import { TraceView } from "@/components/dpe/TraceView";
import { EvalPanel } from "@/components/dpe/EvalPanel";
import { RequireAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Pipelines — Cenli DPE" },
      { name: "description", content: "Live pipeline ingestion, diffs and evaluations for AI-generated commits." },
      { property: "og:title", content: "Pipelines — Cenli DPE" },
      { property: "og:description", content: "Pipeline ingestion, telemetry traces and LLM-as-judge evaluations for AI-generated commits." },
    ],
  }),
  component: () => (
    <RequireAuth>
      <DashboardPage />
    </RequireAuth>
  ),
});

function DashboardPage() {
  const [commits, setCommits] = useState<Commit[]>(() => initialCommits());
  const [selectedId, setSelectedId] = useState<string>(() => "c-1");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const seedRef = useRef(commits.length);

  // Simulated live pipeline feed — keeps the dashboard animated
  // while real submissions can also be injected
  useEffect(() => {
    const interval = setInterval(() => {
      setCommits((prev) => {
        const next = makeCommit(++seedRef.current);
        return [next, ...prev].slice(0, 24);
      });
    }, 4200);
    const progress = setInterval(() => {
      setCommits((prev) => {
        const flow: CommitStatus[] = [
          "Analyzing", "Refactoring", "Linting Pass", "Approved to Main",
        ];
        return prev.map((c, i) => {
          if (i < 1 || i > 6) return c;
          if (c.status === "Failed Evaluation" || c.status === "Approved to Main") return c;
          const idx = flow.indexOf(c.status);
          if (idx === -1 || idx === flow.length - 1) return c;
          return { ...c, status: flow[idx + 1]! };
        });
      });
    }, 3000);
    return () => { clearInterval(interval); clearInterval(progress); };
  }, []);

  const selected = commits.find((c) => c.id === selectedId) ?? commits[0]!;

  const setStatus = (status: CommitStatus) =>
    setCommits((prev) => prev.map((c) => (c.id === selected.id ? { ...c, status } : c)));

  // Submit the currently selected commit's original code to the real backend
  async function handleSubmitToPipeline() {
    if (!selected.original) return;
    setSubmitting(true);
    setSubmitError(null);

    // Optimistically set status to Analyzing
    setStatus("Analyzing");

    try {
      const result = await submitPipeline(
        selected.original,
        selected.language === "Python" ? "submission.py" : "submission.ts",
      );

      // Map backend result to frontend commit status
      const newStatus: CommitStatus =
        result.status === "approved" ? "Approved to Main" :
          result.status === "rejected" ? "Failed Evaluation" :
            "Failed Evaluation";

      // Enrich the commit with real judge scores if available
      const jr = result.judge_report;
      setCommits((prev) =>
        prev.map((c) => {
          if (c.id !== selected.id) return c;
          return {
            ...c,
            status: newStatus,
            techDebt: jr?.technical_debt_reduction_percentage != null
              ? 100 - jr.technical_debt_reduction_percentage
              : c.techDebt,
            complexity: (jr?.cyclomatic_complexity as Commit["complexity"]) ?? c.complexity,
            modularity: jr?.modularity_ratio === "Highly Modular" ? 88
              : jr?.modularity_ratio === "Partially Modular" ? 55
                : jr?.modularity_ratio === "Monolithic" ? 25
                  : c.modularity,
            drift: jr?.architectural_drift_risk === "None" ? 8
              : jr?.architectural_drift_risk === "Low" ? 28
                : jr?.architectural_drift_risk === "High" ? 72
                  : c.drift,
            // If agent produced refactored code, show it in the diff
            refactored: result.agent_summary?.refactored_code ?? c.refactored,
            latencyMs: c.latencyMs,
          };
        })
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Pipeline submission failed");
      setStatus("Failed Evaluation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-6">
        <h1 className="sr-only">Developer Productivity Engineering Dashboard</h1>

        {/* Submit to real backend */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSubmitToPipeline}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-[0_0_20px_oklch(0.74_0.17_175/0.25)] transition-all hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Running DPE Pipeline…</>
                : <><Send className="h-4 w-4" /> Submit to DPE Agent</>
              }
            </button>
            {submitError && (
              <span className="text-[12px] text-destructive">{submitError}</span>
            )}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            Selected: #{selected.hash} · {selected.language}
          </span>
        </div>

        <MetricCards commit={selected} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 h-[560px] lg:col-span-4 xl:col-span-3">
          <PipelineFeed commits={commits} selectedId={selected.id} onSelect={setSelectedId} />
        </section>

        <section className="col-span-12 h-[560px] lg:col-span-8 xl:col-span-6">
          <DiffPanel commit={selected} />
        </section>

        <section className="col-span-12 h-[560px] xl:col-span-3">
          <EvalPanel
            commit={selected}
            onApprove={() => setStatus("Approved to Main")}
            onReject={() => setStatus("Failed Evaluation")}
          />
        </section>

        <section className="col-span-12 h-[420px]">
          <TraceView />
        </section>
      </div>

      <footer className="mt-8 flex items-center justify-between border-t border-border pt-4 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
          <span className="font-mono">cenli-dpe · region europe-west2 · build 2026.06.08</span>
        </div>
        <div className="font-mono">SLO 99.9% · p95 1.2s · queue depth {commits.length}</div>
      </footer>
    </main>
  );
}
