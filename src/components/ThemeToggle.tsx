import {
  setThemePreference,
  useThemePreference,
  type ThemePreference,
} from "../lib/theme";

const PREFERENCES: ThemePreference[] = ["dark", "light", "system"];

/** Settings toggle for the persisted color theme preference. */
export function ThemeToggle() {
  const preference = useThemePreference();
  return (
    <div className="flex items-center gap-1" role="group" aria-label="color theme">
      {PREFERENCES.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={preference === item}
          onClick={() => setThemePreference(item)}
          className={`inline-flex min-h-11 items-center rounded-md px-2 text-body lowercase transition-colors sm:min-h-9 ${
            preference === item ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
