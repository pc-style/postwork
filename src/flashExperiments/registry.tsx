import { compactCards } from "./experiments/compact-cards";
import type { ExperimentSlots } from "./slots";

export type { ExperimentSlots } from "./slots";

export type ExperimentSlot = keyof ExperimentSlots;
export type ExperimentStatus =
  | "new"
  | "reviewing"
  | "liked"
  | "rejected"
  | "shipped";

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
  notes: string[];
  /** The actual overrides patched into the real app while this is active. */
  appSlots: ExperimentSlots;
};

export const flashExperiments: FlashExperiment[] = [
  // testing — our own in-house probes
  compactCards,
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
