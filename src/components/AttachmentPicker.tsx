import { useCallback, useRef, useState } from "react";
import {
  useAttachmentUpload,
  ATTACHMENT_ALLOWED_TYPES,
} from "../lib/attachments";
import {
  getMediaKind,
  MEDIA_MAX_PER_MESSAGE,
  UNSUPPORTED_MEDIA_MESSAGE,
  type MediaKind,
} from "../lib/media";
import type { AttachmentInput } from "../lib/types";
import { Button } from "./Button";

/**
 * Media attachment picker for post and reply composers.
 *
 * Product mode only — `useAttachmentPicker().canUpload` is false in demo,
 * so the upload button is hidden and the gallery stays empty.
 */

export type PendingMedia = {
  key: string;
  previewUrl: string;
  filename: string;
  mediaKind: MediaKind | null;
  uploading: boolean;
  error?: string;
  input?: AttachmentInput;
};

/**
 * Manages pending media uploads. Files are uploaded to Convex storage
 * immediately on selection; `getReadyAttachments()` returns the validated
 * `AttachmentInput[]` to pass into `store.createPost` / `store.createReply`.
 */
export function useAttachmentPicker() {
  const { upload, canUpload } = useAttachmentUpload();
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [limitError, setLimitError] = useState<string | null>(null);
  const [selectionWarning, setSelectionWarning] = useState<string | null>(null);
  const counter = useRef(0);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const selected = Array.from(files);
      const supported = selected.filter((file) => getMediaKind(file.type) !== null);
      const available = Math.max(0, MEDIA_MAX_PER_MESSAGE - pending.length);
      const accepted = supported.slice(0, available);
      setLimitError(
        supported.length > available
          ? `Maximum ${MEDIA_MAX_PER_MESSAGE} media attachments per post or reply.`
          : null,
      );
      setSelectionWarning(
        supported.length !== selected.length
          ? `Unsupported files were not added. ${UNSUPPORTED_MEDIA_MESSAGE}`
          : null,
      );
      for (const file of accepted) {
        counter.current += 1;
        const key = `att-${counter.current}`;
        const previewUrl = URL.createObjectURL(file);
        setPending((prev) => [
          ...prev,
          {
            key,
            previewUrl,
            filename: file.name,
            mediaKind: getMediaKind(file.type),
            uploading: true,
          },
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
    [pending.length, upload],
  );

  const removeAttachment = useCallback((key: string) => {
    setLimitError(null);
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
          (p): p is PendingMedia & { input: AttachmentInput } =>
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
    setLimitError(null);
    setSelectionWarning(null);
  }, []);

  const hasUploading = pending.some((p) => p.uploading);
  const attachmentError = pending.find((p) => p.error)?.error ?? null;
  const attachmentWarning = limitError ?? selectionWarning;
  const hasAttachmentErrors = attachmentError !== null;

  return {
    pending,
    addFiles,
    removeAttachment,
    getReadyAttachments,
    clear,
    canUpload,
    hasUploading,
    hasAttachmentErrors,
    attachmentError,
    attachmentWarning,
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
        aria-label="Choose image or video attachments"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => ref.current?.click()}
      >
        add media
      </Button>
    </>
  );
}

/** Thumbnails of pending uploads with remove buttons. */
export function AttachmentThumbnails({
  pending,
  onRemove,
}: {
  pending: PendingMedia[];
  onRemove: (key: string) => void;
}) {
  if (pending.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-3" aria-live="polite">
      {pending.map((p) => (
        <div
          key={p.key}
          className="relative size-20 overflow-hidden rounded-md border border-border bg-surface"
        >
          {p.mediaKind === "video" ? (
            <video
              src={p.previewUrl}
              aria-label={p.filename}
              muted
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          ) : p.mediaKind === "image" ? (
            <img
              src={p.previewUrl}
              alt={p.filename}
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center p-2 text-center text-[10px] text-muted">
              unsupported file
            </div>
          )}
          {p.uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/75 px-1 text-center text-xs text-muted">
              Uploading…
            </div>
          )}
          {p.error && (
            <div className="absolute inset-0 flex items-center justify-center bg-bg/90 p-1 text-center text-[10px] leading-tight text-urgent">
              Upload failed
            </div>
          )}
          <button
            type="button"
            onClick={() => onRemove(p.key)}
            className="absolute top-0 right-0 flex size-11 items-center justify-center rounded-md bg-bg/90 text-fg transition-colors hover:bg-surface-2"
            aria-label={`Remove ${p.filename}`}
          >
            <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
