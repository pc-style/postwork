import type { FlashExperiment } from "../registry";
import type { Id } from "../../../convex/_generated/dataModel";
import { Composer } from "../../components/Composer";

function FocusedComposer({ postId }: { postId: Id<"posts"> }) {
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/10 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-fg">your reply</div>
          <div className="text-xs text-accent-soft">
            this thread is waiting on a decision
          </div>
        </div>
        <span className="rounded-md border border-accent/30 bg-accent/15 px-1.5 py-0.5 text-[11px] text-accent-soft">
          focused
        </span>
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <Composer
          postId={postId}
          autoFocus
          placeholder="write a reply to move this forward…"
        />
      </div>
    </div>
  );
}

export const focusedComposer: FlashExperiment = {
  slug: "focused-composer",
  title: "focused reply composer",
  summary:
    "Reskin the post-detail composer as a framed callout that signals the thread is waiting on you, while keeping the real composer inside.",
  requestedBy: "response-time review",
  status: "new",
  category: "testing",
  slots: ["composer"],
  notes: [
    "wraps the real <Composer> so reply + @agent summon still work",
    "accent frame nudges a response without changing post detail layout",
    "autoFocus lands the cursor in the reply field on open",
  ],
  appSlots: { composer: ({ postId }) => <FocusedComposer postId={postId} /> },
};
