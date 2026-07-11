import { useState } from "react";
import type { AttachmentWithUrl } from "../lib/types";
import { formatMediaSize } from "../lib/media";

export function AttachmentGallery({
  attachments,
}: {
  attachments: AttachmentWithUrl[];
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((attachment) =>
        attachment.url ? (
          <AttachmentMedia key={attachment._id} attachment={attachment} />
        ) : null,
      )}
    </div>
  );
}

export function AttachmentMedia({
  attachment,
}: {
  attachment: AttachmentWithUrl;
}) {
  const [failed, setFailed] = useState(false);

  if (!attachment.url) return null;

  if (failed) {
    return (
      <div className="flex min-h-20 min-w-40 items-center rounded-md border border-border bg-surface px-3 text-xs text-muted">
        media is no longer available
      </div>
    );
  }

  if (attachment.mediaKind === "video") {
    return (
      <video
        controls
        playsInline
        preload="metadata"
        aria-label={attachment.filename}
        onError={() => setFailed(true)}
        className="max-h-80 max-w-full rounded-md border border-border bg-black"
      >
        <source src={attachment.url} type={attachment.contentType} />
        <a href={attachment.url}>open {attachment.filename}</a>
      </video>
    );
  }

  if (attachment.mediaKind === "file") {
    return (
      <a
        href={attachment.url}
        download={attachment.filename}
        target="_blank"
        rel="noopener noreferrer"
        className="flex max-w-full items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm transition hover:border-accent/40"
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-muted" aria-hidden="true">
          <path d="M7.5 3.75h6l3 3v13.5h-9zM13.5 3.75v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="min-w-0 truncate">{attachment.filename}</span>
        <span className="shrink-0 text-xs text-muted">{formatMediaSize(attachment.size)}</span>
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block max-w-full overflow-hidden rounded-md border border-border transition hover:border-accent/40"
    >
      <img
        src={attachment.url}
        alt={attachment.filename}
        onError={() => setFailed(true)}
        className="max-h-48 max-w-full object-cover"
        loading="lazy"
      />
    </a>
  );
}
