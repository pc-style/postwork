import type { ReactNode } from "react";

export type ChipTone = "accent" | "urgent" | "high" | "neutral" | "muted";
export type ChipSize = "md" | "sm";

const toneClasses: Record<ChipTone, string> = {
  accent: "border-accent/30 bg-accent/10 text-accent-soft",
  urgent:
    "border-urgent/30 bg-urgent/10 text-urgent",
  high: "border-high/30 bg-high/10 text-high",
  neutral: "border-border text-muted",
  muted: "border-border bg-faint/20 text-muted",
};

const dotClasses: Record<ChipTone, string> = {
  accent: "bg-accent-soft",
  urgent: "bg-urgent",
  high: "bg-high",
  neutral: "bg-muted",
  muted: "bg-muted",
};

const sizeClasses: Record<ChipSize, string> = {
  md: "rounded-md text-label",
  sm: "rounded-sm text-label",
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
