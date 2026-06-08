import { STATUS_META, type CommitStatus } from "@/lib/dpe-data";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: CommitStatus; className?: string }) {
  const m = STATUS_META[status];
  const animated = status === "Analyzing" || status === "Refactoring";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        m.bg, m.color, m.ring, className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", m.dot, animated && "animate-pulse-dot")} />
      {status}
    </span>
  );
}