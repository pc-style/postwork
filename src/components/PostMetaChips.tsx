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
}: {
  post: Pick<EnrichedPost, "pinned" | "priority" | "space">;
  className?: string;
}) {
  const p = priorityStyles[post.priority];

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {post.pinned && <Chip tone="accent">Pinned</Chip>}
      <Chip tone={priorityTones[post.priority] ?? "muted"} dot>
        {p.label}
      </Chip>
      <Chip tone="neutral">{post.space}</Chip>
    </div>
  );
}
