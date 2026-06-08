import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Gavel } from "lucide-react";
import { initialCommits, type Commit } from "@/lib/dpe-data";
import { EvalPanel } from "@/components/dpe/EvalPanel";
import { StatusBadge } from "@/components/dpe/StatusBadge";
import { cn } from "@/lib/utils";
import { RequireAuth } from "@/lib/auth";

export const Route = createFileRoute("/evaluations")({
  head: () => ({
    meta: [
      { title: "Evaluations — Cenli DPE" },
      { name: "description", content: "LLM-as-judge audit log with modularity, drift and regression scores plus human-in-the-loop approval for every AI refactor." },
      { property: "og:title", content: "Evaluations — Cenli DPE" },
      { property: "og:description", content: "Audit every AI refactor — modularity, drift and regression scoring with one-click override." },
    ],
  }),
  component: () => (<RequireAuth><EvaluationsPage /></RequireAuth>),
});

function EvaluationsPage() {
  const [commits, setCommits] = useState<Commit[]>(() => initialCommits());
  const [selectedId, setSelectedId] = useState(commits[0]!.id);
  const selected = useMemo(
    () => commits.find((c) => c.id === selectedId) ?? commits[0]!,
    [commits, selectedId],
  );

  const setStatus = (status: Commit["status"]) =>
    setCommits((prev) => prev.map((c) => (c.id === selected.id ? { ...c, status } : c)));

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Evaluations</h1>
        <p className="text-sm text-muted-foreground">
          LLM-as-judge audit log with human-in-the-loop overrides for every refactor.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <section className="surface-card col-span-12 rounded-xl border border-border lg:col-span-8">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <Gavel className="h-4 w-4 text-warning" />
            <h2 className="text-sm font-semibold tracking-tight">Audit Log</h2>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {commits.length} evaluations
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Commit</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Modularity</th>
                  <th className="px-4 py-2 text-right font-medium">Drift</th>
                  <th className="px-4 py-2 text-right font-medium">Regression</th>
                  <th className="px-4 py-2 text-right font-medium">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {commits.map((c) => {
                  const active = c.id === selected.id;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setSelectedId(c.id)}
                      className={cn(
                        "cursor-pointer border-b border-border/60 transition-colors",
                        active ? "bg-primary/5" : "hover:bg-muted/40",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            #{c.hash}
                          </span>
                          <span className="truncate">{c.title}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.modularity}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.drift}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.regression}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-muted-foreground">
                        {c.tokens.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="col-span-12 h-[560px] lg:col-span-4">
          <EvalPanel
            commit={selected}
            onApprove={() => setStatus("Approved to Main")}
            onReject={() => setStatus("Failed Evaluation")}
          />
        </section>
      </div>
    </main>
  );
}