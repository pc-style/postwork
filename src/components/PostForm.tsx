import { useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { SPACES, PRIORITIES, priorityStyles } from "../lib/format";
import { useSpacesList } from "../lib/spaces";
import { Button } from "./Button";
import { ComposerShell } from "./ComposerShell";
import {
  useAttachmentPicker,
  AttachmentButton,
  AttachmentThumbnails,
} from "./AttachmentPicker";
import type { AttachmentInput } from "../lib/types";

type Priority = (typeof PRIORITIES)[number];

export type PostFormFields = {
  title: string;
  body: string;
  space?: string;
  spaceId?: Id<"spaces">;
  priority: Priority;
  attachments?: AttachmentInput[];
};

type SpaceOption = {
  id?: Id<"spaces">;
  label: string;
};

export function PriorityPicker({
  priority,
  onChange,
}: {
  priority: Priority;
  onChange: (priority: Priority) => void;
}) {
  return (
    <div className="flex gap-1">
      {PRIORITIES.map((pr) => (
        <button
          key={pr}
          type="button"
          onClick={() => onChange(pr)}
          className={`rounded-md border px-2.5 py-1 text-xs lowercase transition ${
            priority === pr
              ? priorityStyles[pr].className
              : "border-border text-muted hover:text-fg"
          }`}
        >
          {pr}
        </button>
      ))}
    </div>
  );
}

export function PostForm({
  layout = "default",
  showSpace = false,
  fixedSpace,
  requireTitle = true,
  showTitle = true,
  showMeta = true,
  bodyRows = 7,
  bodyResizeClassName = "resize-y",
  autoFocusTitle = true,
  autoFocusBody = false,
  titleRef,
  textareaRef,
  titlePlaceholder = "what's this about? write a clear title.",
  bodyPlaceholder = "share the full context. posts are durable, write it so someone finds it in search next quarter.",
  submitLabel = "post",
  submittingLabel = "posting…",
  resetOnSubmit = false,
  extraFields,
  onCancel,
  onSubmitted,
  titleClassName,
  textareaClassName,
  footerClassName,
  metaClassName,
  submitButtonClassName,
  onFieldKeyDown,
  onSubmit,
}: {
  layout?: "default" | "quickBar";
  showSpace?: boolean;
  fixedSpace?: SpaceOption;
  requireTitle?: boolean;
  showTitle?: boolean;
  showMeta?: boolean;
  bodyRows?: number;
  bodyResizeClassName?: string;
  autoFocusTitle?: boolean;
  autoFocusBody?: boolean;
  titleRef?: RefObject<HTMLInputElement | null>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  submitLabel?: string;
  submittingLabel?: string;
  resetOnSubmit?: boolean;
  extraFields?: ReactNode;
  onCancel?: () => void;
  onSubmitted?: () => void;
  titleClassName?: string;
  textareaClassName?: string;
  footerClassName?: string;
  metaClassName?: string;
  submitButtonClassName?: string;
  onFieldKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onSubmit: (fields: PostFormFields) => Promise<void> | void;
}) {
  const spaces = useSpacesList();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [busy, setBusy] = useState(false);
  const {
    pending,
    addFiles,
    removeAttachment,
    getReadyAttachments,
    clear: clearAttachments,
    canUpload,
    hasUploading,
    hasAttachmentErrors,
  } = useAttachmentPicker();
  const fallbackSpaces = useMemo<SpaceOption[]>(
    () => SPACES.map((label) => ({ label })),
    [],
  );
  const spaceOptions = useMemo<SpaceOption[]>(
    () =>
      fixedSpace
        ? [fixedSpace]
        : spaces.length > 0
          ? spaces.map((space) => ({
              id: space._id,
              label: space.name,
            }))
          : fallbackSpaces,
    [fallbackSpaces, fixedSpace, spaces],
  );
  const [spaceKey, setSpaceKey] = useState<string>(
    fixedSpace?.id ?? fixedSpace?.label ?? "",
  );

  useEffect(() => {
    if (!showSpace && !fixedSpace) return;
    const hasMatch = spaceOptions.some(
      (option) => (option.id ?? option.label) === spaceKey,
    );
    if (!hasMatch && spaceOptions[0]) {
      setSpaceKey(spaceOptions[0].id ?? spaceOptions[0].label);
    }
  }, [fixedSpace, showSpace, spaceKey, spaceOptions]);

  const selectedSpace =
    spaceOptions.find((option) => (option.id ?? option.label) === spaceKey) ??
    fixedSpace ??
    spaceOptions[0];

  const canSubmit =
    (!requireTitle || title.trim().length > 0) &&
    body.trim().length > 0 &&
    (!showSpace || !!selectedSpace) &&
    !hasUploading &&
    !hasAttachmentErrors;

  const reset = () => {
    setTitle("");
    setBody("");
    setPriority("normal");
    setSpaceKey(spaceOptions[0]?.id ?? spaceOptions[0]?.label ?? "");
    clearAttachments();
  };

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const attachments = getReadyAttachments();
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        space: showSpace || fixedSpace ? selectedSpace?.label : undefined,
        spaceId: showSpace || fixedSpace ? selectedSpace?.id : undefined,
        priority,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      if (resetOnSubmit) reset();
      onSubmitted?.();
    } finally {
      setBusy(false);
    }
  };

  const meta = showMeta ? (
    <div className={metaClassName ?? "mb-4 flex flex-wrap items-center gap-4"}>
      {showSpace ? (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">space</span>
          <select
            value={selectedSpace ? (selectedSpace.id ?? selectedSpace.label) : ""}
            onChange={(event) => setSpaceKey(event.target.value)}
            className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent/50"
          >
            {spaceOptions.map((space) => (
              <option key={space.id ?? space.label} value={space.id ?? space.label}>
                {space.label}
              </option>
            ))}
          </select>
        </label>
      ) : fixedSpace ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">space</span>
          <span className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm text-fg">
            {fixedSpace.label}
          </span>
        </div>
      ) : null}

      <div className="flex items-center gap-2 text-sm">
        <span className="text-muted">priority</span>
        <PriorityPicker priority={priority} onChange={setPriority} />
      </div>

      {extraFields}
      {canUpload && <AttachmentButton onFiles={addFiles} />}
    </div>
  ) : null;

  if (layout === "quickBar") {
    return (
      <div>
        {showTitle ? (
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={onFieldKeyDown}
            autoFocus={autoFocusTitle}
            placeholder={titlePlaceholder}
            className={
              titleClassName ??
              "mb-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-accent/50"
            }
          />
        ) : null}

        {pending.length > 0 && (
          <div className="mb-2">
            <AttachmentThumbnails
              pending={pending}
              onRemove={removeAttachment}
            />
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={body}
            onFocus={() => onSubmitted?.()}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              onFieldKeyDown?.(event);
              if (event.defaultPrevented) return;
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
            onPaste={(e) => {
              if (!canUpload) return;
              const files = Array.from(e.clipboardData.files).filter((f) =>
                f.type.startsWith("image/"),
              );
              if (files.length > 0) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            rows={bodyRows}
            placeholder={bodyPlaceholder}
            className={
              textareaClassName ??
              "min-h-[2.5rem] w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent/50"
            }
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !canSubmit}
            className={
              submitButtonClassName ??
              "shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            }
          >
            {busy ? submittingLabel : submitLabel}
          </button>
        </div>

        {showMeta ? (
          <div className={metaClassName ?? "mt-2 flex flex-wrap items-center gap-3"}>
            {showSpace ? (
              <label className="flex items-center gap-1.5 text-xs text-muted">
                space
                <select
                  value={selectedSpace ? (selectedSpace.id ?? selectedSpace.label) : ""}
                  onChange={(event) => setSpaceKey(event.target.value)}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-xs outline-none focus:border-accent/50"
                >
                  {spaceOptions.map((space) => (
                    <option key={space.id ?? space.label} value={space.id ?? space.label}>
                      {space.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : fixedSpace ? (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span>space</span>
                <span className="rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg">
                  {fixedSpace.label}
                </span>
              </div>
            ) : null}

            <div className="flex items-center gap-1.5 text-xs text-muted">
              priority
              <PriorityPicker priority={priority} onChange={setPriority} />
            </div>

            {extraFields}
            {canUpload && <AttachmentButton onFiles={addFiles} />}
            {hasUploading && (
              <span className="text-xs text-accent-soft">uploading…</span>
            )}
            {hasAttachmentErrors && (
              <span className="text-xs text-urgent">image failed — remove or retry</span>
            )}

            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className="ml-auto text-xs text-muted transition hover:text-fg"
              >
                cancel
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <ComposerShell
      title={showTitle ? title : undefined}
      setTitle={showTitle ? setTitle : undefined}
      titleRef={titleRef}
      titlePlaceholder={titlePlaceholder}
      titleAutoFocus={autoFocusTitle}
      titleClassName={
        titleClassName ??
        "mb-3 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-base font-medium outline-none focus:border-accent/50"
      }
      body={body}
      setBody={setBody}
      textareaRef={textareaRef}
      placeholder={bodyPlaceholder}
      rows={bodyRows}
      autoFocus={autoFocusBody}
      textareaClassName={
        textareaClassName ??
        `mb-3 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm outline-none focus:border-accent/50 ${bodyResizeClassName}`
      }
      onFieldKeyDown={onFieldKeyDown}
      onPaste={(e) => {
        if (!canUpload) return;
        const files = Array.from(e.clipboardData.files).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (files.length > 0) {
          e.preventDefault();
          void addFiles(files);
        }
      }}
      beforeBody={
        pending.length > 0 ? (
          <div className="mb-2">
            <AttachmentThumbnails
              pending={pending}
              onRemove={removeAttachment}
            />
          </div>
        ) : undefined
      }
      afterBody={meta}
      footerClassName={footerClassName ?? "flex justify-end gap-2"}
      actions={
        onCancel ? (
          <Button variant="quiet" onClick={onCancel}>
            cancel
          </Button>
        ) : undefined
      }
      submitLabel={submitLabel}
      submittingLabel={submittingLabel}
      submitting={busy}
      disabled={busy || !canSubmit}
      submitButtonClassName={
        submitButtonClassName ??
        "rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
      }
      onSubmit={() => void submit()}
    />
  );
}
