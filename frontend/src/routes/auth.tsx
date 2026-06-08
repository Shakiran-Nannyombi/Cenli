import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, Mail, User, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { z } from "zod";

// Only allow internal, relative paths to prevent open-redirect abuse.
const safeRedirect = z
  .string()
  .regex(/^\/[a-zA-Z0-9/_\-]*$/)
  .refine((v) => !v.startsWith("//") && !v.includes("://"), "invalid redirect")
  .optional();
const searchSchema = z.object({ redirect: safeRedirect });

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Cenli DPE" },
      { name: "description", content: "Sign in or create a Cenli workspace to access pipeline ingestion, agent telemetry and policy enforcement for AI-generated code." },
      { property: "og:title", content: "Sign in — Cenli DPE" },
      { property: "og:description", content: "Access your Cenli DPE workspace — the control plane for AI-generated code." },
    ],
  }),
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const safe =
      redirect && /^\/[a-zA-Z0-9/_\-]*$/.test(redirect) && !redirect.startsWith("//")
        ? redirect
        : "/dashboard";
    if (user) navigate({ to: safe, replace: true });
  }, [user, redirect, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else await signUp(name, email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative mx-auto flex min-h-[calc(100vh-120px)] max-w-md items-center px-6 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,oklch(0.74_0.17_175/0.12),transparent_70%)]" />
      <div className="w-full rounded-xl border border-border bg-background/60 p-8 backdrop-blur-xl">
        <div className="mb-6 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-gradient-to-br from-primary to-accent">
            <Zap className="h-4 w-4 text-background" />
          </div>
          <div>
            <div className="text-sm font-semibold">Cenli DPE</div>
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {mode === "signin" ? "sign in to continue" : "create your workspace"}
            </div>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-1 rounded-md border border-border bg-background/40 p-1">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === m ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "signin" ? "Sign in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          {mode === "signup" && (
            <Field icon={User} label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ada Lovelace"
                className="h-10 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 text-sm focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
              />
            </Field>
          )}
          <Field icon={Mail} label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.dev"
              className="h-10 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 font-mono text-xs focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </Field>
          <Field icon={Lock} label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className="h-10 w-full rounded-md border border-border bg-background/60 pl-9 pr-3 font-mono text-xs focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/40"
            />
          </Field>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          mock auth · session stored locally
        </p>
      </div>
    </main>
  );
}

function Field({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
    </label>
  );
}