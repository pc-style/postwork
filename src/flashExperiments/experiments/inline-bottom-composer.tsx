import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "../../lib/session";
import { useStore } from "../../lib/store";
import { SPACES, PRIORITIES, priorityStyles } from "../../lib/format";
import type { FlashExperiment } from "../registry";

// Hitesh's suggestion: put the input box at the bottom directly instead of
// opening a dialog on the "new post" button. This docks a quick-post bar to the
// bottom of the viewport; it expands inline when focused — no modal.
function InlineBottomComposer() {
  const { currentUserId } = useSession();
  const store = useStore();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [space, setSpace] = useState<string>(SPACES[0]);
  const [priority, setPriority] =
    useState<(typeof PRIORITIES)[number]>("normal");
  const [busy, setBusy] = useState(false);

  const canPost = title.trim().length > 0 && body.trim().length > 0;

  const reset = () => {
    setTitle("");
    setBody("");
    setSpace(SPACES[0]);
    setPriority("normal");
    setOpen(false);
  };

  const submit = async () => {
    if (!canPost || !currentUserId) return;
    setBusy(true);
    try {
      const postId = await store.createPost({
        authorId: currentUserId,
        title: title.trim(),
        body: body.trim(),
        space,
        priority,
      });
      reset();
      navigate({ to: "/posts/$postId", params: { postId } });
    } finally {
      setBusy(false);
    }
  };

  return (
    // fixed bottom dock — escapes the feed flow so it sits at the bottom of the
    // viewport. extra bottom padding clears the floating experiment-exit pill
    // (RootLayout renders it centered at bottom-4).
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-16">
      <div className="pointer-events-auto mx-auto max-w-3xl rounded-lg border border-border bg-surface p-3 shadow-2xl backdrop-blur">
        {open && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="title — what's this about?"
            className="mb-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-accent/50"
          />
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onFocus={() => setOpen(true)}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
            }}
            rows={open ? 3 : 1}
            placeholder="start a post…  (no dialog — write it right here)"
            className="min-h-[2.5rem] w-full resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent/50"
          />
          <button
            onClick={() => void submit()}
            disabled={busy || !canPost}
            className="shrink-0 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:opacity-40"
          >
            {busy ? "posting…" : "post"}
          </button>
        </div>

        {open && (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              space
              <select
                value={space}
                onChange={(e) => setSpace(e.target.value)}
                className="rounded-md border border-border bg-bg px-2 py-1 text-xs outline-none"
              >
                {SPACES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1.5 text-xs text-muted">
              priority
              <div className="flex gap-1">
                {PRIORITIES.map((pr) => (
                  <button
                    key={pr}
                    onClick={() => setPriority(pr)}
                    className={`rounded-md border px-2 py-0.5 text-xs lowercase transition ${
                      priority === pr
                        ? priorityStyles[pr].className
                        : "border-border text-muted hover:text-fg"
                    }`}
                  >
                    {pr}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={reset}
              className="ml-auto text-xs text-muted transition hover:text-fg"
            >
              cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

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
  slots: ["feedHeader"],
  notes: [
    "graduated — now the default experience",
    "renders a fixed quick-post bar docked at the bottom of the viewport",
    "expands inline on focus (title + body + space/priority) — no modal",
    "creates a real post and navigates to it; ⌘/Ctrl + Enter posts",
    "shown on the feed in this preview via the feedHeader slot",
  ],
  appSlots: { feedHeader: <InlineBottomComposer /> },
};
