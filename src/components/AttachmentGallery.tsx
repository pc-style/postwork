import { useState } from "react";
import type { AttachmentWithUrl } from "../lib/types";
import { formatFileSize } from "../lib/media";

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
    return <FileDownloadChip attachment={attachment} onFail={() => setFailed(true)} />;
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

/**
 * Generic file downloads go through an explicit fetch → Blob(octet-stream) →
 * object-URL flow instead of a direct cross-origin link. Convex storage serves
 * the uploader-supplied content type without `Content-Disposition: attachment`,
 * so a plain link could open uploaded HTML/SVG as active content; forcing the
 * bytes into an inert blob keeps the chip download-only.
 */
function FileDownloadChip({
  attachment,
  onFail,
}: {
  attachment: AttachmentWithUrl;
  onFail: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    if (!attachment.url || downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(attachment.url);
      if (!response.ok) throw new Error("Download failed.");
      const bytes = await response.arrayBuffer();
      const blobUrl = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      try {
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = attachment.filename;
        anchor.click();
      } finally {
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      onFail();
    } finally {
      setDownloading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={downloading}
      className="flex max-w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left text-sm transition hover:border-accent/40 disabled:cursor-progress disabled:opacity-70"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-5 shrink-0 text-muted" aria-hidden="true">
        <path d="M7.5 3.75h6l3 3v13.5h-9zM13.5 3.75v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="min-w-0 truncate">{attachment.filename}</span>
      <span className="shrink-0 text-xs text-muted">
        {downloading ? "downloading…" : formatFileSize(attachment.size)}
      </span>
    </button>
  );
}
