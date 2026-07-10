import { type ReactNode, type RefObject, useEffect } from "react";

export function ComposerShell({
  body,
  setBody,
  textareaRef,
  placeholder,
  rows,
  autoFocus = false,
  textareaClassName,
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
  body: string;
  setBody: (body: string) => void;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  rows: number;
  autoFocus?: boolean;
  textareaClassName: string;
  footerClassName?: string;
  hint: ReactNode;
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

  return (
    <>
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        rows={rows}
        className={textareaClassName}
      />
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
