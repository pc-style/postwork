import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
} from "react";
import { Button } from "./Button";
import { FormField } from "./FormField";

export function ComposerShell({
  title,
  setTitle,
  titleRef,
  titleLabel = "Title",
  titleHelp,
  titleError,
  titlePlaceholder,
  titleClassName = "ui-field",
  titleAutoFocus = false,
  titleRequired = false,
  titleOptional = false,
  body,
  setBody,
  textareaRef,
  bodyLabel = "Reply",
  bodyHelp,
  bodyError,
  srOnlyBodyLabel = false,
  placeholder,
  rows,
  autoFocus = false,
  autoGrow = false,
  textareaClassName = "ui-field resize-y",
  onFieldKeyDown,
  onPaste,
  beforeBody,
  afterBody,
  footerClassName = "mt-3 flex flex-wrap items-center justify-between gap-3",
  hint,
  actions,
  submitLabel,
  submittingLabel,
  submitting,
  disabled,
  submitType = "button",
  onSubmit,
}: {
  title?: string;
  setTitle?: (title: string) => void;
  titleRef?: RefObject<HTMLInputElement | null>;
  titleLabel?: string;
  titleHelp?: ReactNode;
  titleError?: ReactNode;
  titlePlaceholder?: string;
  titleClassName?: string;
  titleAutoFocus?: boolean;
  titleRequired?: boolean;
  titleOptional?: boolean;
  body: string;
  setBody: (body: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  bodyLabel?: string;
  bodyHelp?: ReactNode;
  bodyError?: ReactNode;
  srOnlyBodyLabel?: boolean;
  placeholder: string;
  rows: number;
  autoFocus?: boolean;
  /**
   * Grow the textarea to fit its content (capped by the max-height in
   * `textareaClassName`, which then scrolls internally). Replaces manual
   * `resize-y` dragging, which could blow the composer out of its container.
   */
  autoGrow?: boolean;
  textareaClassName?: string;
  onFieldKeyDown?: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onPaste?: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  beforeBody?: ReactNode;
  afterBody?: ReactNode;
  footerClassName?: string;
  hint?: ReactNode;
  actions?: ReactNode;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  disabled: boolean;
  submitType?: "button" | "submit";
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (autoFocus) textareaRef?.current?.focus();
  }, [autoFocus, textareaRef]);

  useEffect(() => {
    if (!autoGrow) return;
    const node = textareaRef?.current;
    if (!node) return;
    // Let CSS min/max-height clamp the measured content height. Resetting to
    // "auto" first makes scrollHeight shrink again when text is deleted.
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [autoGrow, body, textareaRef]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onFieldKeyDown?.(event);
    if (event.defaultPrevented) return;
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <>
      {title !== undefined && setTitle ? (
        <FormField
          label={titleLabel}
          help={titleHelp}
          error={titleError}
          required={titleRequired}
          optional={titleOptional}
        >
          <input
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus={titleAutoFocus}
            placeholder={titlePlaceholder}
            className={titleClassName}
          />
        </FormField>
      ) : null}
      {beforeBody}
      <FormField
        label={bodyLabel}
        help={bodyHelp}
        error={bodyError}
        required
        srOnlyLabel={srOnlyBodyLabel}
      >
        <textarea
          ref={textareaRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={onPaste}
          placeholder={placeholder}
          rows={rows}
          className={textareaClassName}
        />
      </FormField>
      {afterBody}
      <div className={footerClassName}>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-label text-muted">
          {hint}
        </div>
        <div className="ml-auto flex flex-wrap justify-end gap-2">
          {actions}
          <Button
            type={submitType}
            onClick={submitType === "button" ? onSubmit : undefined}
            disabled={disabled}
            loading={submitting}
            loadingLabel={submittingLabel}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </>
  );
}
