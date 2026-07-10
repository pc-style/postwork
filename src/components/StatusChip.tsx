import type { AgentTask } from "../lib/agentTasks";
import { Chip, type ChipTone } from "./Chip";

const statusTones: Record<AgentTask["status"], ChipTone> = {
  pending: "muted",
  running: "high",
  done: "accent",
  failed: "urgent",
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
