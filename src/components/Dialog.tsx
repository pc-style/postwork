import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { trapDialogFocus } from "../lib/dialogFocus";
import { Button } from "./Button";

export function Dialog({
  title,
  description,
  onClose,
  children,
  initialFocusRef,
  returnFocusRef,
  dismissible = true,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const initialFocusRefRef = useRef(initialFocusRef);
  const returnFocusRefRef = useRef(returnFocusRef);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    initialFocusRefRef.current = initialFocusRef;
    returnFocusRefRef.current = returnFocusRef;
  }, [initialFocusRef, returnFocusRef]);

  useEffect(() => {
    triggerRef.current ??=
      returnFocusRefRef.current?.current ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const dialog = ref.current;
    dialog?.showModal();
    const focusFrame = requestAnimationFrame(() => {
      const firstTabbable = dialog
        ? Array.from(
            dialog.querySelectorAll<HTMLElement>(
              "input:not([type='hidden']):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])",
            ),
          ).find((element) => element.checkVisibility?.() ?? true)
        : undefined;
      const target =
        initialFocusRefRef.current?.current ??
        dialog?.querySelector<HTMLElement>("[autofocus]") ??
        firstTabbable ??
        dialog;
      target?.focus();
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      const target = returnFocusRefRef.current?.current ?? triggerRef.current;
      window.setTimeout(() => target?.isConnected && target.focus(), 0);
    };
  }, []);

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      onKeyDown={trapDialogFocus}
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
      className="ui-dialog m-auto max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-0 text-fg backdrop:bg-black/70 sm:max-h-[85vh] sm:w-[calc(100%-2rem)]"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={titleId} className="text-title font-semibold text-fg [text-wrap:balance]">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-body leading-6 text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {dismissible ? (
          <Button variant="icon" aria-label="Close dialog" onClick={onClose}>
            <CloseIcon />
          </Button>
        ) : null}
      </div>
      <div className="px-4 py-5 sm:px-6">{children}</div>
    </dialog>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
