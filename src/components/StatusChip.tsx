import type { AgentTask } from "../lib/agentTasks";

const statusClasses: Record<AgentTask["status"], string> = {
  pending:
    "border-[var(--color-border)] text-[var(--color-muted)] bg-[var(--color-faint)]/20",
  running:
    "border-[var(--color-high)]/30 text-[var(--color-high)] bg-[var(--color-high)]/10 animate-pulse",
  done: "border-accent/30 text-accent-soft bg-accent/10",
  failed:
    "border-[var(--color-urgent)]/30 text-[var(--color-urgent)] bg-[var(--color-urgent)]/10",
};

export function StatusChip({ status }: { status: AgentTask["status"] }) {
  return (
    <span
      className={`rounded-md border px-1.5 py-0.5 text-[11px] ${statusClasses[status]}`}
    >
      {status}
    </span>
  );
}
