import type { AgentTask } from "../lib/agentTasks";
import { Chip, type ChipTone } from "./Chip";

const statusTones: Record<AgentTask["status"], ChipTone> = {
  queued: "muted",
  running: "high",
  done: "accent",
  failed: "urgent",
  cancelled: "muted",
};

export function StatusChip({ status }: { status: AgentTask["status"] }) {
  return (
    <Chip
      tone={statusTones[status]}
      className={status === "running" ? "animate-pulse" : ""}
    >
      {status}
    </Chip>
  );
}
