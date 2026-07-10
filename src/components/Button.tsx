import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger" | "icon";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-accent bg-accent font-medium text-fg hover:border-accent-soft hover:bg-accent-soft active:border-accent active:bg-accent disabled:border-accent/45 disabled:bg-accent/45 disabled:text-fg/80",
  secondary:
    "border border-border bg-surface font-medium text-fg hover:border-accent/50 hover:bg-surface-2 active:bg-bg disabled:border-border disabled:bg-surface disabled:text-muted",
  quiet:
    "border border-transparent bg-transparent font-medium text-muted hover:bg-surface hover:text-fg active:bg-surface-2 disabled:text-muted/70",
  danger:
    "border border-urgent/50 bg-urgent/10 font-medium text-urgent hover:border-urgent/70 hover:bg-urgent/20 active:bg-urgent/25 disabled:border-urgent/25 disabled:bg-urgent/5 disabled:text-urgent/65",
  icon:
    "border border-transparent bg-transparent text-muted hover:bg-surface hover:text-fg active:bg-surface-2 disabled:text-muted/70",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-2.5 py-1.5 text-xs",
  md: "min-h-11 px-3.5 py-2 text-sm",
  lg: "min-h-12 px-4 py-2.5 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      loadingLabel = "working…",
      className = "",
      children,
      disabled,
      ...props
    },
    ref,
  ) {
    const sizeClass =
      variant === "icon" ? "size-11 shrink-0 p-0" : SIZE_CLASSES[size];

    return (
      <button
        ref={ref}
        type="button"
        className={`relative inline-flex items-center justify-center gap-2 rounded-md transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${sizeClass} ${className}`.trim()}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        <span className={loading ? "invisible" : "inline-flex items-center gap-2"}>
          {children}
        </span>
        {loading ? (
          <span
            className="absolute inset-0 inline-flex items-center justify-center gap-2 px-2"
            aria-live="polite"
          >
            <span className="ui-spinner" aria-hidden="true" />
            <span>{loadingLabel}</span>
          </span>
        ) : null}
      </button>
    );
  },
);
