import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Button } from "./Button";

export function AnchoredConfirmation({
  triggerLabel,
  title,
  description,
  confirmLabel,
  onConfirm,
  fallbackFocusRef,
  align = "left",
  className = "",
}: {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const restoreFocus = () => {
    requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus();
      else fallbackFocusRef?.current?.focus();
    });
  };

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(null);
    restoreFocus();
  };

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const first = cancelRef.current;
      const last = confirmRef.current;
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, busy]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setBusy(false);
      setOpen(false);
      restoreFocus();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `We couldn't ${confirmLabel}. Try again.`,
      );
      setBusy(false);
    }
  };

  return (
    <span ref={rootRef} className={`relative inline-flex ${className}`}>
      <Button
        ref={triggerRef}
        variant="quiet"
        size="sm"
        className="min-h-11 px-1.5 text-xs hover:text-urgent sm:min-h-9"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
      {open ? (
        <span
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          className={`absolute bottom-full z-40 mb-2 w-[min(19rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 text-left shadow-[0_12px_36px_rgba(0,0,0,0.5)] ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <strong id={titleId} className="block text-sm font-semibold text-fg">
            {title}
          </strong>
          <span id={descriptionId} className="mt-1 block text-xs leading-5 text-muted">
            {description}
          </span>
          {error ? (
            <span role="alert" className="ui-error mt-2 block">
              {error}
            </span>
          ) : null}
          <span className="mt-3 flex justify-end gap-2">
            <Button
              ref={cancelRef}
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={close}
            >
              cancel
            </Button>
            <Button
              ref={confirmRef}
              variant="danger"
              size="sm"
              loading={busy}
              loadingLabel="deleting…"
              onClick={() => void confirm()}
            >
              {confirmLabel}
            </Button>
          </span>
        </span>
      ) : null}
    </span>
  );
}
