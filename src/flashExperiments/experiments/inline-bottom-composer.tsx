import { QuickPostBar } from "../../components/QuickPostBar";
import type { FlashExperiment } from "../registry";

// Hitesh's suggestion: put the input box at the bottom directly instead of
// opening a dialog on the "new post" button. This shipped as QuickPostBar —
// the preview renders the real component so it can't drift from what's
// actually live.
export const inlineBottomComposer: FlashExperiment = {
  slug: "inline-bottom-composer",
  title: "inline bottom composer",
  summary:
    "Dock the new-post input to the bottom of the screen so you write a post inline, instead of opening a separate dialog from the new post button.",
  requestedBy: "@HiteshRohira15",
  status: "shipped",
  category: "community",
  suggestion: {
    name: "Hitesh",
    handle: "@HiteshRohira15",
    link: "https://x.com/HiteshRohira15/status/2071356370302218327",
  },
  notes: [
    "graduated — now the default experience",
    "renders a fixed quick-post bar docked at the bottom of the viewport",
    "expands inline on focus (title + body + space/priority) — no modal",
    "creates a real post and navigates to it; ⌘/Ctrl + Enter posts",
    "shown on the feed in this preview via the feedHeader slot",
  ],
  appSlots: { feedHeader: <QuickPostBar /> },
};
