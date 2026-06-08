import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { initialCommits, makeCommit, type Commit, type CommitStatus } from "@/lib/dpe-data";
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
  const seedRef = useRef(commits.length);

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
    return () => {
      clearInterval(interval);
      clearInterval(progress);
    };
  }, []);

  const selected = commits.find((c) => c.id === selectedId) ?? commits[0]!;

  const setStatus = (status: CommitStatus) =>
    setCommits((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, status } : c)),
    );

  return (
    <main className="mx-auto max-w-[1600px] px-6 py-6">
      <div className="mb-6">
        <h1 className="sr-only">Developer Productivity Engineering Dashboard</h1>
        <MetricCards commit={selected} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <section className="col-span-12 h-[560px] lg:col-span-4 xl:col-span-3">
          <PipelineFeed
            commits={commits}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />
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
          <span className="font-mono">cenli-dpe · region us-east · build 2026.06.08</span>
        </div>
        <div className="font-mono">SLO 99.9% · p95 1.2s · queue depth {commits.length}</div>
      </footer>
    </main>
  );
}