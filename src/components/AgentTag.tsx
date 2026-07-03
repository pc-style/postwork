import { Chip } from "./Chip";

/**
 * Small "agent" affordance shown next to AI coding-agent authors, mirroring the
 * "APP" badge Slack renders on bot messages. Mono, lowercase, on-brand.
 */
export function AgentTag({ className = "" }: { className?: string }) {
  return (
    <Chip
      tone="neutral"
      size="sm"
      uppercase
      className={`bg-surface-2 ${className}`}
    >
      agent
    </Chip>
  );
}
