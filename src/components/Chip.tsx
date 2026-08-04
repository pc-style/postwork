import type { ReactNode } from "react";

export type ChipTone = "accent" | "urgent" | "high" | "neutral" | "muted";
export type ChipSize = "md" | "sm";

const toneClasses: Record<ChipTone, string> = {
  accent: "bg-accent/10 text-accent-soft",
  urgent: "bg-urgent/10 text-urgent",
  high: "bg-high/10 text-high",
  neutral: "bg-surface-2 text-muted",
  muted: "bg-faint/20 text-muted",
};

/**
 * One tag spec for every badge in the app: rounded-sm, text-label, lowercase,
 * subtle background tint, no borders. Status is conveyed through the tone's
 * text color and tint only, so `size` and `dot` are accepted for call-site
 * compatibility but no longer change the rendering.
 */
export function Chip({
  tone,
  size: _size = "md",
  dot: _dot = false,
  className = "",
  children,
}: {
  tone: ChipTone;
  size?: ChipSize;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-label lowercase ${toneClasses[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
