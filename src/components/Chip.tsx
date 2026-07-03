import type { ReactNode } from "react";

export type ChipTone = "accent" | "urgent" | "high" | "neutral" | "muted";
export type ChipSize = "md" | "sm";

const toneClasses: Record<ChipTone, string> = {
  accent: "border-accent/30 bg-accent/10 text-accent-soft",
  urgent:
    "border-[var(--color-urgent)]/30 bg-[var(--color-urgent)]/10 text-[var(--color-urgent)]",
  high: "border-[var(--color-high)]/30 bg-[var(--color-high)]/10 text-[var(--color-high)]",
  neutral: "border-[var(--color-border)] text-[var(--color-muted)]",
  muted: "border-[var(--color-border)] bg-[var(--color-faint)]/20 text-[var(--color-muted)]",
};

const dotClasses: Record<ChipTone, string> = {
  accent: "bg-accent-soft",
  urgent: "bg-[var(--color-urgent)]",
  high: "bg-[var(--color-high)]",
  neutral: "bg-[var(--color-muted)]",
  muted: "bg-[var(--color-muted)]",
};

const sizeClasses: Record<ChipSize, string> = {
  md: "rounded-md text-[11px]",
  sm: "rounded-sm text-[10px]",
};

export function Chip({
  tone,
  size = "md",
  dot = false,
  uppercase = false,
  className = "",
  children,
}: {
  tone: ChipTone;
  size?: ChipSize;
  dot?: boolean;
  uppercase?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 ${sizeClasses[size]} ${toneClasses[tone]} ${
        uppercase ? "font-semibold tracking-wide uppercase" : ""
      } ${className}`}
    >
      {dot && <span className={`size-1.5 shrink-0 rounded-full ${dotClasses[tone]}`} />}
      {children}
    </span>
  );
}
