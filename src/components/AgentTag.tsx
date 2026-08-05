import { Chip } from "./Chip";

/**
 * Small "agent" affordance shown next to AI coding-agent authors, mirroring the
 * "APP" badge Slack renders on bot messages. Lowercase, on-brand.
 */
export function AgentTag({ className = "" }: { className?: string }) {
  return (
    <Chip tone="neutral" className={className}>
      agent
    </Chip>
  );
}
