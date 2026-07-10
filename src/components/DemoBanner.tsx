import { DEMO_BANNER_MESSAGE, demoPolicy } from "../lib/demoMode";

export const DEMO_BANNER_LABEL = "public demo notice";

export function DemoBanner() {
  if (!demoPolicy.publicDemoBanner) return null;

  return (
    <aside
      aria-label={DEMO_BANNER_LABEL}
      className="border-b border-accent/25 bg-surface px-4 py-2 text-center text-xs text-muted sm:px-6"
    >
      {DEMO_BANNER_MESSAGE}
    </aside>
  );
}
