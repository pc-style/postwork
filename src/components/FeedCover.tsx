import { useState } from "react";
import {
  setFeedCoverMode,
  useFeedCoverMode,
  type FeedCoverMode,
} from "../lib/feedDisplay";
import type { EnrichedPost } from "../lib/types";

export type PostCover = NonNullable<EnrichedPost["cover"]>;

/**
 * A feed card's cover, always a right-aligned square thumbnail (hackernews /
 * reddit style): 56px in compact mode, 96px in regular. Lazy, fixed-size
 * against layout shift, and self-hiding when the image fails to load.
 */
export function FeedCover({
  cover,
  mode,
}: {
  cover: PostCover;
  mode: FeedCoverMode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl === cover.url) return null;

  const px = mode === "regular" ? 96 : 56;
  return (
    <img
      src={cover.url}
      alt={cover.alt}
      loading="lazy"
      width={px}
      height={px}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(cover.url)}
      className={`${
        mode === "regular" ? "size-24" : "size-14"
      } shrink-0 rounded-md border border-border bg-bg object-cover`}
    />
  );
}

const MODES: FeedCoverMode[] = ["compact", "regular"];

/** Quiet feed-header toggle for the persisted cover display preference. */
export function FeedCoverModeToggle() {
  const mode = useFeedCoverMode();
  return (
    <div className="flex items-center gap-1" role="group" aria-label="media display">
      <span className="text-label lowercase text-muted" aria-hidden="true">
        media
      </span>
      {MODES.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={mode === item}
          onClick={() => setFeedCoverMode(item)}
          className={`inline-flex min-h-11 items-center rounded-md px-2 text-label lowercase transition-colors sm:min-h-9 ${
            mode === item ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
