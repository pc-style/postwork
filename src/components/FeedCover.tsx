import { useState } from "react";
import {
  setFeedCoverMode,
  useFeedCoverMode,
  type FeedCoverMode,
} from "../lib/feedDisplay";
import type { EnrichedPost } from "../lib/types";

export type PostCover = NonNullable<EnrichedPost["cover"]>;

// Below this natural width a banner would upscale and blur the image, so
// small covers always render as the thumbnail variant.
const MIN_BANNER_WIDTH = 320;

export type FeedCoverVariant = "banner" | "thumb";

/** Effective layout for a cover: mode choice, except small images stay thumbs. */
export function feedCoverVariant(
  cover: PostCover,
  mode: FeedCoverMode,
): FeedCoverVariant {
  if (mode === "compact") return "thumb";
  if (cover.width !== undefined && cover.width < MIN_BANNER_WIDTH) return "thumb";
  return "banner";
}

/**
 * A feed card's single cover visual. Lazy, dimensioned against layout shift,
 * and self-hiding when the image fails to load.
 */
export function FeedCover({
  cover,
  variant,
}: {
  cover: PostCover;
  variant: FeedCoverVariant;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (failedUrl === cover.url) return null;

  if (variant === "thumb") {
    return (
      <img
        src={cover.url}
        alt={cover.alt}
        loading="lazy"
        width={56}
        height={56}
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(cover.url)}
        className="size-14 shrink-0 rounded-md border border-border bg-bg object-cover"
      />
    );
  }

  return (
    <img
      src={cover.url}
      alt={cover.alt}
      loading="lazy"
      width={cover.width}
      height={cover.height}
      referrerPolicy="no-referrer"
      style={{
        aspectRatio:
          cover.width && cover.height ? `${cover.width} / ${cover.height}` : "16 / 9",
      }}
      onError={() => setFailedUrl(cover.url)}
      className="max-h-[180px] w-full rounded-lg border border-border bg-bg object-cover"
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
