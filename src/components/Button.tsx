import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost" | "quiet" | "pill";
type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "rounded-lg bg-accent font-medium text-fg transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40",
  ghost:
    "rounded-md border border-accent/30 text-accent-soft transition hover:bg-accent/15 disabled:cursor-not-allowed disabled:opacity-40",
  quiet:
    "rounded-md text-muted transition hover:text-fg",
  pill: "rounded-full bg-accent px-3.5 py-1.5 text-xs font-medium text-fg transition hover:bg-accent-soft",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3 py-1.5 text-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const sizeClasses = variant === "pill" ? "" : SIZE_CLASSES[size];
  return (
    <button
      type="button"
      className={`${VARIANT_CLASSES[variant]} ${sizeClasses} ${className}`.trim()}
      {...props}
    />
  );
}
