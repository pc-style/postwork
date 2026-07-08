import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Right-side detail sheet for admin records. Native <dialog> for focus
 * trapping + Escape handling; positioned as a full-height right drawer.
 * Slide-in uses @starting-style (see index.css `dialog[open]` rules — the
 * sheet overrides translate on its own class).
 */
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="sheet-panel fixed inset-y-0 right-0 m-0 flex h-full max-h-none w-full max-w-md flex-col bg-surface text-fg shadow-[0_0_0_1px_rgba(255,255,255,0.08),-8px_0_24px_rgba(0,0,0,0.45),-24px_0_64px_rgba(0,0,0,0.55)] backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-fg">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
          ) : null}
        </div>
        <button
          onClick={onClose}
          className="-m-2 shrink-0 p-2 text-sm text-muted transition-colors hover:text-fg"
        >
          close
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
      {footer ? (
        <div className="border-t border-border px-6 py-4">{footer}</div>
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
    <div className="py-2.5">
      <div className="text-label font-medium lowercase text-muted">{label}</div>
      <div className={`mt-1 text-sm text-fg ${mono ? "font-mono text-xs" : ""}`}>
        {children}
      </div>
    </div>
  );
}
