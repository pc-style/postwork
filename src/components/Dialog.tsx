import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl backdrop:bg-black/60"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          onClick={onClose}
          className="text-[var(--color-muted)] transition hover:text-fg"
        >
          close
        </button>
      </div>
      {children}
    </dialog>
  );
}
