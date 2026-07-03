import { AppShell } from "../../components/AppShell";
import type { FlashExperiment } from "../registry";

// Galicius's suggestion: navigation on the sides, main content centered in the
// middle like twitter, so the reading column stays narrow and scannable. This
// shipped as the default AppShell — the preview renders the real shell so it
// can't drift from what's actually live.
export const centeredRail: FlashExperiment = {
  slug: "centered-rail",
  title: "centered reading column",
  summary:
    "Move navigation to the sides and keep the main content in a narrow centered column, like twitter, so the feed reads more easily.",
  requestedBy: "@Galicius315715",
  status: "shipped",
  category: "community",
  suggestion: {
    name: "Galicius",
    handle: "@Galicius315715",
    link: "https://x.com/Galicius315715/status/2071353160166232304",
  },
  slots: ["app-shell"],
  notes: [
    "graduated — now the default experience",
    "replaces the whole app shell with a three-column layout",
    "left nav rail (home/priority/spaces/agents/orgs) + new post + user switcher",
    "narrow centered reading column wraps the real feed and post pages",
    "right rail shows unread/urgent context on large screens",
  ],
  appSlots: {
    shell: AppShell,
  },
};
