import type { ReactNode } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { EnrichedPost } from "../lib/types";

/**
 * The override points an experiment can patch into the *real* app. An
 * experiment supplies only the slots it changes; everything else renders as the
 * unmodified product, so the single visible difference is the experiment.
 *
 * Slots are consumed by the real components:
 *   - shell · nav · sidebar  → RootLayout
 *   - feedHeader · postCard   → FeedPage
 *   - post · replies · composer → PostPage
 */
export type ExperimentSlots = {
  /** Replace the whole app chrome. `children` is the routed page. */
  shell?: (props: { children: ReactNode }) => ReactNode;
  /** Replace the header nav links. */
  nav?: ReactNode;
  /** Add a left rail, switching the shell into its two-column layout. */
  sidebar?: ReactNode;
  /** Content rendered above the feed list. */
  feedHeader?: ReactNode;
  /** Replace a single feed item (still wrapped in a real link to the post). */
  postCard?: (props: { post: EnrichedPost }) => ReactNode;
  /** Replace the post-detail article. */
  post?: (props: { postId: Id<"posts"> }) => ReactNode;
  /** Replace the reply surface under a post. */
  replies?: (props: { postId: Id<"posts"> }) => ReactNode;
  /** Replace the composer under a post. */
  composer?: (props: { postId: Id<"posts"> }) => ReactNode;
};

export const NO_SLOTS: ExperimentSlots = {};
