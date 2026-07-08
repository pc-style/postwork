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
      className="m-auto max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface p-6 text-fg shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.45),0_24px_64px_rgba(0,0,0,0.55)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-fg [text-wrap:balance]">
          {title}
        </h2>
        <button
          onClick={onClose}
          className="-m-2 p-2 text-sm text-muted transition-colors hover:text-fg"
        >
          close
        </button>
      </div>
      {children}
    </dialog>
  );
}
