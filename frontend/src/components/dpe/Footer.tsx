import { Link } from "@tanstack/react-router";
import { Zap, Github, Twitter, Linkedin } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background/60">
      <div className="mx-auto max-w-[1600px] px-6 py-10">
        <div className="flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
          <div className="flex flex-col gap-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-accent">
                <Zap className="h-3.5 w-3.5 text-background" />
              </div>
              <span className="text-sm font-semibold tracking-tight">
                Cenli <span className="text-gradient-primary">DPE</span>
              </span>
            </Link>
            <p className="max-w-xs text-[11px] leading-relaxed text-muted-foreground">
              The control plane for AI-generated code. Traced, evaluated, and architecturally sound.
            </p>
          </div>

          <div className="flex flex-wrap gap-8 text-[11px] text-muted-foreground">
            <div className="flex flex-col gap-2">
              <span className="font-medium text-foreground">Product</span>
              <Link to="/dashboard" className="transition-colors hover:text-foreground">Pipelines</Link>
              <Link to="/telemetry" className="transition-colors hover:text-foreground">Telemetry</Link>
              <Link to="/evaluations" className="transition-colors hover:text-foreground">Evaluations</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-medium text-foreground">Company</span>
              <Link to="/about" className="transition-colors hover:text-foreground">About</Link>
              <Link to="/policies" className="transition-colors hover:text-foreground">Policies</Link>
              <Link to="/agents" className="transition-colors hover:text-foreground">Agents</Link>
            </div>
            <div className="flex flex-col gap-2">
              <span className="font-medium text-foreground">Connect</span>
              <a href="https://github.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <Github className="h-3 w-3" /> GitHub
              </a>
              <a href="https://twitter.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <Twitter className="h-3 w-3" /> Twitter
              </a>
              <a href="https://linkedin.com" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition-colors hover:text-foreground">
                <Linkedin className="h-3 w-3" /> LinkedIn
              </a>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-[11px] text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} Cenli. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link to="/about" className="transition-colors hover:text-foreground">Privacy</Link>
            <Link to="/about" className="transition-colors hover:text-foreground">Terms</Link>
            <Link to="/about" className="transition-colors hover:text-foreground">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
