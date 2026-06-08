import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bell, GitCommitVertical, LogOut, Search, Settings2, ShieldCheck, UserCircle2, Zap } from "lucide-react";
import { STATUS_META, type CommitStatus } from "@/lib/dpe-data";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useAuth } from "@/lib/auth";

const NAV = [
  { label: "Home",        to: "/" },
  { label: "About",       to: "/about" },
  { label: "Pipelines",   to: "/dashboard" },
  { label: "Telemetry",   to: "/telemetry" },
  { label: "Evaluations", to: "/evaluations" },
  { label: "Policies",    to: "/policies" },
  { label: "Agents",      to: "/agents" },
] as const;

export function Header() {
  const [query, setQuery] = useState("");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-6 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="relative grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-accent shadow-[0_0_20px_oklch(0.74_0.17_175/0.4)]">
            <Zap className="h-4 w-4 text-background" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">
              Cenli <span className="text-gradient-primary">DPE</span>
            </div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              codegen quality control
            </div>
          </div>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = pathname === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="relative ml-auto hidden w-72 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commits, hashes, agents…"
            className="h-9 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 font-mono text-xs placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-2">
          <button className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
            <Bell className="h-4 w-4" />
          </button>
          <button className="rounded-md border border-border p-2 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground">
            <Settings2 className="h-4 w-4" />
          </button>
          <div className="hidden h-6 w-px bg-border md:block" />
          {user ? (
            <div className="hidden items-center gap-2 md:flex">
              <div className="flex items-center gap-2 rounded-md border border-border bg-background/60 px-2.5 py-1.5">
                <UserCircle2 className="h-4 w-4 text-primary" />
                <span className="font-mono text-[11px] capitalize text-foreground">{user.name}</span>
              </div>
              <button
                onClick={() => { signOut(); navigate({ to: "/" }); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="hidden rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 md:inline-flex"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-background/40">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 overflow-x-auto px-6 py-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <GitCommitVertical className="h-3.5 w-3.5" />
            <span className="font-mono">24</span> commits in window
          </div>
          <div className="h-3 w-px bg-border" />
          {(Object.keys(STATUS_META) as CommitStatus[]).map((s) => {
            const m = STATUS_META[s];
            return (
              <div key={s} className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                <span className="text-muted-foreground">{s}</span>
              </div>
            );
          })}
          <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            policy <span className="font-mono text-foreground">strict-modular-v4</span>
          </div>
        </div>
      </div>
    </header>
  );
}