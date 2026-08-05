import type { EnrichedPost } from "../lib/types";
import { Chip, type ChipTone } from "./Chip";
import { priorityStyles } from "../lib/format";

export const priorityTones: Record<string, ChipTone> = {
  urgent: "urgent",
  high: "high",
  normal: "muted",
};

export function PostMetaChips({
  post,
  className = "",
  quiet = false,
}: {
  post: Pick<EnrichedPost, "pinned" | "priority" | "space">;
  className?: string;
  /**
   * Feed-card mode: skip the normal-priority chip and reveal the space chip
   * only on hover/focus of the surrounding `group` (always visible on touch).
   */
  quiet?: boolean;
}) {
  const p = priorityStyles[post.priority];
  const revealClass = quiet
    ? "transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
    : "";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {post.pinned && <Chip tone="accent">pinned</Chip>}
      {!quiet || post.priority !== "normal" ? (
        <Chip tone={priorityTones[post.priority] ?? "muted"}>{p.label}</Chip>
      ) : null}
      <span className={revealClass}>
        <Chip tone="neutral">{post.space}</Chip>
      </span>
    </div>
  );
}
