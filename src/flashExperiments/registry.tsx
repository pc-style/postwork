import { priorityFirstFeed } from "./experiments/priority-first-feed";
import { wideReviewShell } from "./experiments/wide-review-shell";
import { railNav } from "./experiments/rail-nav";
import { compactCards } from "./experiments/compact-cards";
import { focusedComposer } from "./experiments/focused-composer";
import type { ExperimentSlots } from "./slots";

export type { ExperimentSlots } from "./slots";

export type ExperimentSlot =
  | "app-shell"
  | "nav"
  | "sidebar"
  | "feedHeader"
  | "postCard"
  | "post"
  | "replies"
  | "composer";
export type ExperimentStatus = "new" | "reviewing" | "liked" | "rejected";

export type FlashExperiment = {
  slug: string;
  title: string;
  summary: string;
  requestedBy: string;
  status: ExperimentStatus;
  /** Display tags for the lab list. */
  slots: ExperimentSlot[];
  notes: string[];
  /** The actual overrides patched into the real app while this is active. */
  appSlots: ExperimentSlots;
};

export const flashExperiments: FlashExperiment[] = [
  priorityFirstFeed,
  wideReviewShell,
  railNav,
  compactCards,
  focusedComposer,
];

export function getFlashExperiment(slug: string) {
  return flashExperiments.find((experiment) => experiment.slug === slug) ?? null;
}
