import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
} from "react";

export function ComposerShell({
  title,
  setTitle,
  titleRef,
  titlePlaceholder,
  titleClassName,
  titleAutoFocus = false,
  body,
  setBody,
  textareaRef,
  placeholder,
  rows,
  autoFocus = false,
  textareaClassName,
  onFieldKeyDown,
  beforeBody,
  afterBody,
  footerClassName = "mt-2 flex items-center justify-between gap-2",
  hint,
  actions,
  submitLabel,
  submittingLabel,
  submitting,
  disabled,
  submitButtonClassName,
  onSubmit,
}: {
  title?: string;
  setTitle?: (title: string) => void;
  titleRef?: RefObject<HTMLInputElement | null>;
  titlePlaceholder?: string;
  titleClassName?: string;
  titleAutoFocus?: boolean;
  body: string;
  setBody: (body: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  rows: number;
  autoFocus?: boolean;
  textareaClassName: string;
  onFieldKeyDown?: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  beforeBody?: ReactNode;
  afterBody?: ReactNode;
  footerClassName?: string;
  hint?: ReactNode;
  actions?: ReactNode;
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  disabled: boolean;
  submitButtonClassName: string;
  onSubmit: () => void;
}) {
  useEffect(() => {
    if (autoFocus) textareaRef?.current?.focus();
  }, [autoFocus, textareaRef]);

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
        <input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus={titleAutoFocus}
          placeholder={titlePlaceholder}
          className={titleClassName}
        />
      ) : null}
      {beforeBody}
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        className={textareaClassName}
      />
      {afterBody}
      <div className={footerClassName}>
        <div className="flex items-center gap-2">{hint}</div>
        <div className="flex gap-2">
          {actions}
          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled}
            className={submitButtonClassName}
          >
            {submitting ? submittingLabel : submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}
