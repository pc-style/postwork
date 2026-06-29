import { priorityFirstFeed } from "./experiments/priority-first-feed";
import { wideReviewShell } from "./experiments/wide-review-shell";
import { railNav } from "./experiments/rail-nav";
import { compactCards } from "./experiments/compact-cards";
import { focusedComposer } from "./experiments/focused-composer";
import { centeredRail } from "./experiments/centered-rail";
import { inlineBottomComposer } from "./experiments/inline-bottom-composer";
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

/**
 * Which work-in-progress track an experiment lives in.
 *   - community → suggested by someone outside the team (see `suggestion`)
 *   - testing   → our own in-house probes
 *   - vip       → high-priority / stakeholder-driven bets
 */
export type ExperimentCategory = "community" | "testing" | "vip";

/** Attribution for a community-sourced suggestion. */
export type ExperimentSuggestion = {
  /** Display name of the person who suggested it. */
  name: string;
  /** Their handle, e.g. "@Galicius315715". */
  handle: string;
  /** Optional link to where it was suggested. */
  link?: string;
};

export type FlashExperiment = {
  slug: string;
  title: string;
  summary: string;
  requestedBy: string;
  status: ExperimentStatus;
  /** Which WIP track this experiment belongs to. */
  category: ExperimentCategory;
  /** Present for community experiments: who suggested it and where. */
  suggestion?: ExperimentSuggestion;
  /** Display tags for the lab list. */
  slots: ExperimentSlot[];
  notes: string[];
  /** The actual overrides patched into the real app while this is active. */
  appSlots: ExperimentSlots;
};

export const flashExperiments: FlashExperiment[] = [
  // community — suggested from outside the team
  centeredRail,
  inlineBottomComposer,
  // testing — our own in-house probes
  priorityFirstFeed,
  wideReviewShell,
  railNav,
  compactCards,
  focusedComposer,
];

/** Order categories render in on the lab page. */
export const EXPERIMENT_CATEGORY_ORDER: ExperimentCategory[] = [
  "community",
  "testing",
  "vip",
];

export function experimentsByCategory(category: ExperimentCategory) {
  return flashExperiments.filter(
    (experiment) => experiment.category === category,
  );
}

export function getFlashExperiment(slug: string) {
  return flashExperiments.find((experiment) => experiment.slug === slug) ?? null;
}
