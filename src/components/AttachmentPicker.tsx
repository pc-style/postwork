import { useCallback, useRef, useState } from "react";
import {
  useAttachmentUpload,
  ATTACHMENT_ALLOWED_TYPES,
} from "../lib/attachments";
import type { AttachmentInput, AttachmentWithUrl } from "../lib/types";

/**
 * Image attachment picker + gallery components (Phase 3.4).
 *
 * Product mode only — `useAttachmentPicker().canUpload` is false in demo,
 * so the upload button is hidden and the gallery stays empty.
 */

export type PendingImage = {
  key: string;
  previewUrl: string;
  filename: string;
  uploading: boolean;
  error?: string;
  input?: AttachmentInput;
};

/**
 * Manages pending image uploads. Files are uploaded to Convex storage
 * immediately on selection; `getReadyAttachments()` returns the validated
 * `AttachmentInput[]` to pass into `store.createPost` / `store.createReply`.
 */
export function useAttachmentPicker() {
  const { upload, canUpload } = useAttachmentUpload();
  const [pending, setPending] = useState<PendingImage[]>([]);
  const counter = useRef(0);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const images = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      for (const file of images) {
        counter.current += 1;
        const key = `att-${counter.current}`;
        const previewUrl = URL.createObjectURL(file);
        setPending((prev) => [
          ...prev,
          { key, previewUrl, filename: file.name, uploading: true },
        ]);
        try {
          const input = await upload(file);
          setPending((prev) =>
            prev.map((p) =>
              p.key === key ? { ...p, uploading: false, input } : p,
            ),
          );
        } catch (err) {
          setPending((prev) =>
            prev.map((p) =>
              p.key === key
                ? {
                    ...p,
                    uploading: false,
                    error: err instanceof Error ? err.message : String(err),
                  }
                : p,
            ),
          );
        }
      }
    },
    [upload],
  );

  const removeAttachment = useCallback((key: string) => {
    setPending((prev) => {
      const entry = prev.find((p) => p.key === key);
      if (entry) URL.revokeObjectURL(entry.previewUrl);
      return prev.filter((p) => p.key !== key);
    });
  }, []);

  const getReadyAttachments = useCallback(
    (): AttachmentInput[] =>
      pending
        .filter(
          (p): p is PendingImage & { input: AttachmentInput } =>
            !!p.input && !p.error,
        )
        .map((p) => p.input),
    [pending],
  );

  const clear = useCallback(() => {
    setPending((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
  }, []);

  const hasUploading = pending.some((p) => p.uploading);
  const hasAttachmentErrors = pending.some((p) => !!p.error);

  return {
    pending,
    addFiles,
    removeAttachment,
    getReadyAttachments,
    clear,
    canUpload,
    hasUploading,
    hasAttachmentErrors,
  };
}

/** Hidden file input + trigger button. Renders nothing in demo mode. */
export function AttachmentButton({
  onFiles,
}: {
  onFiles: (files: FileList | File[]) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={ATTACHMENT_ALLOWED_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        title="attach images"
        className="rounded-md border border-border px-2 py-1 text-label text-muted transition hover:text-fg"
      >
        {"+ image"}
      </button>
    </>
  );
}

/** Thumbnails of pending uploads with remove buttons. */
export function AttachmentThumbnails({
  pending,
  onRemove,
}: {
  pending: PendingImage[];
  onRemove: (key: string) => void;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {pending.map((p) => (
        <div
          key={p.key}
          className="relative size-16 overflow-hidden rounded-md border border-border bg-surface"
        >
          <img
            src={p.previewUrl}
            alt={p.filename}
            className="size-full object-cover"
          />
          {p.uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/60 text-[10px] text-muted">
              uploading…
            </div>
          )}
          {p.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-urgent/20 p-1 text-center text-[9px] leading-tight text-urgent">
              {p.error}
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(p.key)}
            className="absolute top-0 right-0 flex size-4 items-center justify-center rounded bg-bg/80 text-[10px] text-fg hover:bg-bg"
            aria-label="remove image"
          >
            x
          </button>
        </div>
      ))}
    </div>
  );
}

/** Gallery of uploaded attachments (post-level or reply-level). */
export function AttachmentGallery({
  attachments,
}: {
  attachments: AttachmentWithUrl[];
}) {
  if (attachments.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {attachments.map((att) =>
        att.url ? (
          <a
            key={att._id}
            href={att.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-md border border-border transition hover:border-accent/40"
          >
            <img
              src={att.url}
              alt={att.filename}
              className="max-h-48 max-w-xs object-cover"
              loading="lazy"
            />
          </a>
        ) : null,
      )}
    </div>
  );
}
