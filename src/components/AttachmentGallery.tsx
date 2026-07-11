import { useState } from "react";
import type { AttachmentWithUrl } from "../lib/types";

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
