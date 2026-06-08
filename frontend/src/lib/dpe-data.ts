export type CommitStatus =
  | "Analyzing"
  | "Refactoring"
  | "Linting Pass"
  | "Failed Evaluation"
  | "Approved to Main";

export interface Commit {
  id: string;
  hash: string;
  language: "TypeScript" | "Python" | "Go" | "Rust" | "Java";
  loc: number;
  status: CommitStatus;
  author: string;
  model: string;
  createdAt: number;
  title: string;
  techDebt: number; // 0-100, lower better
  complexity: "Low" | "Medium" | "High";
  modularity: number; // 0-100
  drift: number; // 0-100
  regression: number; // 0-100
  latencyMs: number;
  tokens: number;
  original: string;
  refactored: string;
}

export const STATUS_META: Record<
  CommitStatus,
  { color: string; bg: string; ring: string; dot: string }
> = {
  Analyzing:        { color: "text-info",        bg: "bg-info/10",        ring: "ring-info/30",        dot: "bg-info" },
  Refactoring:      { color: "text-accent",      bg: "bg-accent/10",      ring: "ring-accent/30",      dot: "bg-accent" },
  "Linting Pass":   { color: "text-warning",     bg: "bg-warning/10",     ring: "ring-warning/30",     dot: "bg-warning" },
  "Failed Evaluation": { color: "text-destructive", bg: "bg-destructive/10", ring: "ring-destructive/30", dot: "bg-destructive" },
  "Approved to Main": { color: "text-success",   bg: "bg-success/10",     ring: "ring-success/30",     dot: "bg-success" },
};

const ORIGINAL_TS = `// fetch + transform users (AI first-pass)
export async function getUsers(req, res) {
  const r = await fetch("https://api.example.com/v1/users?limit=" + req.query.limit)
  const j = await r.json()
  let out = []
  for (let i = 0; i < j.data.length; i++) {
    const u = j.data[i]
    if (u.active == true) {
      let name = u.first + " " + u.last
      let email = u.email ? u.email.toLowerCase() : ""
      out.push({ id: u.id, name: name, email: email, role: u.role || "member" })
    }
  }
  res.status(200).json({ users: out, count: out.length })
}`;

const REFACTORED_TS = `// users.controller.ts
import { z } from "zod";
import { fetchActiveUsers } from "@/services/users";

const Query = z.object({ limit: z.coerce.number().min(1).max(100).default(25) });

export async function getUsers(req, res) {
  const { limit } = Query.parse(req.query);
  const users = await fetchActiveUsers(limit);
  return res.json({ users, count: users.length });
}

// services/users.ts
export const fetchActiveUsers = async (limit: number) => {
  const { data } = await api.get<UserDTO[]>("/v1/users", { params: { limit } });
  return data.filter(u => u.active).map(toUser);
};

const toUser = (u: UserDTO): User => ({
  id: u.id,
  name: \`\${u.first} \${u.last}\`.trim(),
  email: u.email?.toLowerCase() ?? "",
  role: u.role ?? "member",
});`;

const ORIGINAL_PY = `def process(data):
    results = []
    for d in data:
        if d['status'] == 'ok':
            x = d['value'] * 2
            if x > 100:
                x = 100
            results.append({'id': d['id'], 'v': x, 'ts': time.time()})
    return results`;

const REFACTORED_PY = `from dataclasses import dataclass
from typing import Iterable

MAX_VALUE = 100

@dataclass(frozen=True)
class Result:
    id: str
    value: int
    ts: float

def process(records: Iterable[dict]) -> list[Result]:
    return [
        Result(id=r["id"], value=min(r["value"] * 2, MAX_VALUE), ts=time.time())
        for r in records if r.get("status") == "ok"
    ]`;

const TITLES = [
  "feat(users): paginate active user query",
  "refactor(billing): extract invoice line builder",
  "fix(auth): harden token rotation guard",
  "perf(search): memoize tokenizer pipeline",
  "chore(api): normalize error envelope",
  "feat(agents): stream tool-call deltas",
  "fix(cache): bound LRU on cold start",
  "refactor(orm): split repository façade",
  "feat(traces): emit span attributes",
  "fix(queue): idempotent retry semantics",
];
const AUTHORS = ["agent.codex", "agent.sonnet", "agent.gpt5", "agent.gemini", "agent.opus"];
const MODELS = ["claude-sonnet-4.5", "gpt-5-codex", "gemini-2.5-pro", "deepseek-coder-v3"];
const LANGS: Commit["language"][] = ["TypeScript", "Python", "Go", "Rust", "Java"];
const STATUSES: CommitStatus[] = ["Analyzing", "Refactoring", "Linting Pass", "Failed Evaluation", "Approved to Main"];

let counter = 0;
const rnd = (seed: number) => {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
};

export function makeCommit(seed = ++counter): Commit {
  const r = (n: number) => rnd(seed + n);
  const lang = LANGS[Math.floor(r(1) * LANGS.length)]!;
  const isPy = lang === "Python";
  const status = STATUSES[Math.floor(r(2) * STATUSES.length)]!;
  const techDebt = Math.floor(r(3) * 70) + 10;
  const complexity = techDebt > 55 ? "High" : techDebt > 30 ? "Medium" : "Low";
  return {
    id: `c-${seed.toString(36)}`,
    hash: Math.floor(r(4) * 0xffffff).toString(16).padStart(6, "0") + Math.floor(r(5) * 0xff).toString(16).padStart(2, "0"),
    language: lang,
    loc: Math.floor(r(6) * 480) + 24,
    status,
    author: AUTHORS[Math.floor(r(7) * AUTHORS.length)]!,
    model: MODELS[Math.floor(r(8) * MODELS.length)]!,
    createdAt: Date.now() - Math.floor(r(9) * 1000 * 60 * 30),
    title: TITLES[Math.floor(r(10) * TITLES.length)]!,
    techDebt,
    complexity,
    modularity: Math.floor(r(11) * 50) + 45,
    drift: Math.floor(r(12) * 60) + 10,
    regression: Math.floor(r(13) * 50) + 5,
    latencyMs: Math.floor(r(14) * 1800) + 220,
    tokens: Math.floor(r(15) * 9000) + 800,
    original: isPy ? ORIGINAL_PY : ORIGINAL_TS,
    refactored: isPy ? REFACTORED_PY : REFACTORED_TS,
  };
}

export const initialCommits = (): Commit[] =>
  Array.from({ length: 12 }, (_, i) => makeCommit(i + 1));

export interface TraceSpan {
  name: string;
  kind: "agent" | "llm" | "tool" | "retriever" | "eval";
  ms: number;
  status: "ok" | "warn" | "error";
  attrs?: Record<string, string | number>;
  children?: TraceSpan[];
}

export const sampleTrace: TraceSpan = {
  name: "dpe.refactor_loop",
  kind: "agent",
  ms: 4280,
  status: "ok",
  attrs: { session: "sess_8af2", iterations: 3 },
  children: [
    {
      name: "llm.plan_refactor",
      kind: "llm",
      ms: 612,
      status: "ok",
      attrs: { model: "sonnet-4.5", tokens_in: 1820, tokens_out: 412 },
    },
    {
      name: "mcp.history.search",
      kind: "tool",
      ms: 184,
      status: "ok",
      attrs: { tool: "trace_db.lookup", hits: 7 },
      children: [
        { name: "vector.knn", kind: "retriever", ms: 92, status: "ok", attrs: { k: 8, recall: 0.94 } },
        { name: "graph.expand", kind: "retriever", ms: 71, status: "ok", attrs: { depth: 2 } },
      ],
    },
    {
      name: "subagent.self_correct",
      kind: "agent",
      ms: 2104,
      status: "warn",
      attrs: { passes: 2 },
      children: [
        { name: "llm.critique", kind: "llm", ms: 712, status: "ok", attrs: { model: "gpt-5-codex" } },
        { name: "tool.apply_patch", kind: "tool", ms: 88, status: "ok" },
        { name: "llm.critique", kind: "llm", ms: 690, status: "warn", attrs: { drift: 0.18 } },
        { name: "tool.apply_patch", kind: "tool", ms: 102, status: "ok" },
      ],
    },
    {
      name: "eval.llm_judge",
      kind: "eval",
      ms: 1180,
      status: "ok",
      attrs: { rubric: "v3.2", verdict: "approve" },
      children: [
        { name: "metric.modularity", kind: "eval", ms: 220, status: "ok", attrs: { score: 86 } },
        { name: "metric.drift", kind: "eval", ms: 198, status: "warn", attrs: { score: 27 } },
        { name: "metric.regression", kind: "eval", ms: 246, status: "ok", attrs: { score: 14 } },
      ],
    },
  ],
};