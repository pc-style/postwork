import { DEMO_BANNER_MESSAGE } from "../lib/demoMode";

export const DEMO_BANNER_LABEL = "public demo notice";

export function DemoBanner() {
  return (
    <aside
      aria-label={DEMO_BANNER_LABEL}
      className="border-b border-accent/25 bg-surface px-4 py-2 text-center text-xs text-muted sm:px-6"
    >
      {DEMO_BANNER_MESSAGE}
    </aside>
  );
}
