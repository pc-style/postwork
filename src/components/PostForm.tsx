import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { PRIORITIES, SPACES, priorityStyles } from "../lib/format";
import { insertContentUrl } from "../lib/insertContentUrl";
import { useSpacesList } from "../lib/spaces";
import type { AttachmentInput } from "../lib/types";
import {
  AttachmentButton,
  AttachmentThumbnails,
  useAttachmentPicker,
} from "./AttachmentPicker";
import { Button } from "./Button";
import { ComposerShell } from "./ComposerShell";
import { FormField } from "./FormField";
import { GifPicker } from "./GifPicker";
import { SelectionGroup } from "./SelectionGroup";

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

type StoredDraft = {
  title?: string;
  body?: string;
  priority?: Priority;
  spaceKey?: string;
};

export function PriorityPicker({
  priority,
  onChange,
}: {
  priority: Priority;
  onChange: (priority: Priority) => void;
}) {
  return (
    <SelectionGroup
      label="Priority"
      value={priority}
      onChange={onChange}
      options={PRIORITIES.map((value) => ({
        value,
        label: priorityStyles[value].label,
        className: priorityStyles[value].className,
      }))}
    />
  );
}

export function PostForm({
  showSpace = false,
  fixedSpace,
  requireTitle = true,
  bodyRows = 7,
  autoFocusTitle = true,
  autoFocusBody = false,
  titleRef,
  textareaRef,
  titlePlaceholder = "Example: Release checklist update",
  bodyPlaceholder = "Add the context, decision, or question.",
  titleHelp = "Summarize the post in one line.",
  bodyHelp = "Add the context, decision, or question.",
  submitLabel = "post",
  submittingLabel = "posting…",
  resetOnSubmit = false,
  extraFields,
  onCancel,
  draftKey,
  onSubmit,
}: {
  showSpace?: boolean;
  fixedSpace?: SpaceOption;
  requireTitle?: boolean;
  bodyRows?: number;
  autoFocusTitle?: boolean;
  autoFocusBody?: boolean;
  titleRef?: RefObject<HTMLInputElement | null>;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  titleHelp?: string;
  bodyHelp?: string;
  submitLabel?: string;
  submittingLabel?: string;
  resetOnSubmit?: boolean;
  extraFields?: ReactNode;
  onCancel?: () => void;
  draftKey?: string;
  onSubmit: (fields: PostFormFields) => Promise<void> | void;
}) {
  const draft = useMemo(() => readDraft(draftKey), [draftKey]);
  const spaces = useSpacesList();
  const [title, setTitle] = useState(draft?.title ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [priority, setPriority] = useState<Priority>(draft?.priority ?? "normal");
  const [spaceKey, setSpaceKey] = useState(
    draft?.spaceKey ?? fixedSpace?.id ?? fixedSpace?.label ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);
  const [bodyTouched, setBodyTouched] = useState(false);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const bodyRef = textareaRef ?? internalTextareaRef;
  const {
    pending,
    addFiles,
    removeAttachment,
    getReadyAttachments,
    clear: clearAttachments,
    canUpload,
    hasUploading,
    hasAttachmentErrors,
    attachmentError,
    attachmentWarning,
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
          ? spaces.map((space) => ({ id: space._id, label: space.name }))
          : fallbackSpaces,
    [fallbackSpaces, fixedSpace, spaces],
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

  useEffect(() => {
    if (!draftKey) return;
    window.sessionStorage.setItem(
      draftKey,
      JSON.stringify({ title, body, priority, spaceKey } satisfies StoredDraft),
    );
  }, [body, draftKey, priority, spaceKey, title]);

  const selectedSpace =
    spaceOptions.find((option) => (option.id ?? option.label) === spaceKey) ??
    fixedSpace ??
    spaceOptions[0];
  const titleMissing = requireTitle && title.trim().length === 0;
  const bodyMissing = body.trim().length === 0;
  const spaceMissing = showSpace && !selectedSpace;
  const canSubmit =
    !titleMissing &&
    !bodyMissing &&
    !spaceMissing &&
    !hasUploading &&
    !hasAttachmentErrors;

  const reset = () => {
    setTitle("");
    setBody("");
    setPriority("normal");
    setSpaceKey(spaceOptions[0]?.id ?? spaceOptions[0]?.label ?? "");
    setTitleTouched(false);
    setBodyTouched(false);
    clearAttachments();
  };

  const onGif = (url: string) => {
    const element = bodyRef.current;
    const next = insertContentUrl(
      body,
      element?.selectionStart ?? body.length,
      element?.selectionEnd ?? body.length,
      url,
    );
    setBody(next.value);
    setFormError(null);
    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const submit = async () => {
    setTitleTouched(true);
    setBodyTouched(true);
    if (!canSubmit || busy) return;
    setBusy(true);
    setFormError(null);
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
      if (draftKey) window.sessionStorage.removeItem(draftKey);
      if (resetOnSubmit) reset();
    } catch (caught) {
      setFormError(
        caught instanceof Error
          ? caught.message
          : "We couldn't create the post. Check the fields and try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <ComposerShell
        title={title}
        setTitle={(value) => {
          setTitle(value);
          setFormError(null);
        }}
        titleRef={titleRef}
        titleLabel="Title"
        titleHelp={titleHelp}
        titleError={titleTouched && titleMissing ? "Add a title." : undefined}
        titlePlaceholder={titlePlaceholder}
        titleAutoFocus={autoFocusTitle}
        titleRequired={requireTitle}
        titleOptional={!requireTitle}
        body={body}
        setBody={(value) => {
          setBody(value);
          setFormError(null);
        }}
        textareaRef={bodyRef}
        bodyLabel="Post"
        bodyHelp={bodyHelp}
        bodyError={bodyTouched && bodyMissing ? "Add the post content." : undefined}
        placeholder={bodyPlaceholder}
        rows={bodyRows}
        autoFocus={autoFocusBody}
        textareaClassName="ui-field min-h-32 resize-y"
        onPaste={(event) => {
          if (!canUpload) return;
          const files = Array.from(event.clipboardData.files).filter(
            (file) => file.type.startsWith("image/") || file.type.startsWith("video/"),
          );
          if (files.length > 0) {
            event.preventDefault();
            void addFiles(files);
          }
        }}
        beforeBody={
          pending.length > 0 ? (
            <AttachmentThumbnails pending={pending} onRemove={removeAttachment} />
          ) : undefined
        }
        afterBody={
          <div className="grid gap-5">
            {showSpace ? (
              <FormField label="Space" required error={spaceMissing ? "Choose a space." : undefined}>
                <select
                  value={selectedSpace ? selectedSpace.id ?? selectedSpace.label : ""}
                  onChange={(event) => setSpaceKey(event.target.value)}
                  className="ui-field"
                >
                  {spaceOptions.map((space) => (
                    <option key={space.id ?? space.label} value={space.id ?? space.label}>
                      {space.label}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : fixedSpace ? (
              <div>
                <p className="text-sm font-medium text-fg">Space</p>
                <p className="mt-1.5 rounded-md border border-border bg-bg px-3 py-2.5 text-sm text-muted">
                  {fixedSpace.label}
                </p>
              </div>
            ) : null}
            <PriorityPicker priority={priority} onChange={setPriority} />
            {extraFields}
            <div className="flex flex-wrap items-center gap-2" aria-live="polite">
              {canUpload ? <AttachmentButton onFiles={addFiles} /> : null}
              <GifPicker onSelect={onGif} />
              {hasUploading ? <span className="text-xs text-accent-soft">Optimizing and uploading media…</span> : null}
              {hasAttachmentErrors ? (
                <span className="ui-error">{attachmentError ?? "A media attachment failed to upload."}</span>
              ) : null}
              {attachmentWarning ? <span className="text-xs text-urgent">{attachmentWarning}</span> : null}
              {!hasUploading && !hasAttachmentErrors && !attachmentWarning ? (
                <span className="text-xs text-muted">images up to 10 MB; MP4/WebM up to 50 MB; 8 files max</span>
              ) : null}
            </div>
          </div>
        }
        footerClassName="mt-1 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end"
        actions={
          onCancel ? (
            <Button variant="secondary" onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
              cancel
            </Button>
          ) : undefined
        }
        hint={
          <span>
            {canSubmit
              ? "Press Cmd or Ctrl + Enter to post."
              : "Complete the required fields before posting."}
          </span>
        }
        submitLabel={submitLabel}
        submittingLabel={submittingLabel}
        submitting={busy}
        disabled={busy || !canSubmit}
        onSubmit={() => void submit()}
      />
      {formError ? <p role="alert" className="ui-error">{formError}</p> : null}
    </div>
  );
}

function readDraft(key: string | undefined): StoredDraft | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const value: unknown = JSON.parse(window.sessionStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object") return null;
    const candidate = value as StoredDraft;
    return {
      title: typeof candidate.title === "string" ? candidate.title : undefined,
      body: typeof candidate.body === "string" ? candidate.body : undefined,
      priority: PRIORITIES.includes(candidate.priority as Priority)
        ? candidate.priority
        : undefined,
      spaceKey: typeof candidate.spaceKey === "string" ? candidate.spaceKey : undefined,
    };
  } catch {
    return null;
  }
}
