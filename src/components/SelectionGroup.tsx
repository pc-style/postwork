import { useId, type ReactNode } from "react";

export function SelectionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode; className?: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();

  return (
    <fieldset className={className}>
      <legend className="mb-1.5 text-sm font-medium text-fg">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent-soft ${
                checked
                  ? option.className ?? "border-accent/60 bg-accent/15 text-fg"
                  : "border-border bg-bg text-muted hover:border-accent/40 hover:text-fg"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                className={`size-2 shrink-0 rounded-full border ${
                  checked ? "border-accent-soft bg-accent-soft" : "border-muted"
                }`}
                aria-hidden="true"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ToggleButton({
  pressed,
  onPressedChange,
  children,
  className = "",
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={`inline-flex min-h-11 items-center rounded-md border px-3 py-2 text-xs font-medium lowercase transition-colors ${
        pressed
          ? "border-accent/60 bg-accent/15 text-fg"
          : "border-border bg-transparent text-muted hover:border-accent/40 hover:bg-surface hover:text-fg"
      } ${className}`}
    >
      {children}
    </button>
  );
}
