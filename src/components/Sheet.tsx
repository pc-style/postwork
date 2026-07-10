import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { Button } from "./Button";

export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
  initialFocusRef,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const subtitleId = useId();

  useEffect(() => {
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.showModal();
    requestAnimationFrame(() =>
      (initialFocusRef?.current ?? headingRef.current)?.focus(),
    );
    return () => {
      const target = triggerRef.current;
      requestAnimationFrame(() => target?.isConnected && target.focus());
    };
  }, [initialFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={subtitle ? subtitleId : undefined}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="sheet-panel fixed inset-0 m-0 flex h-dvh max-h-none w-full max-w-none flex-col border-0 bg-surface p-0 text-fg backdrop:bg-black/70 sm:inset-y-0 sm:right-0 sm:left-auto sm:w-[min(30rem,100vw)] sm:border-l sm:border-border"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className="break-words text-base font-semibold text-fg focus:outline-none"
          >
            {title}
          </h2>
          {subtitle ? (
            <p id={subtitleId} className="mt-1 break-words text-xs leading-5 text-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        <Button variant="icon" aria-label="Close panel" onClick={onClose}>
          <CloseIcon />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {children}
      </div>
      {footer ? (
        <div className="border-t border-border bg-surface px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}

export function SheetField({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div
        className={`mt-1 break-words text-sm text-fg ${
          mono ? "overflow-x-auto font-mono text-xs" : ""
        }`}
      >
        {children}
      </div>
    </div>
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
