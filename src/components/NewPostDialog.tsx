import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { SPACES, PRIORITIES, priorityStyles } from "../lib/format";

export function NewPostDialog({ onClose }: { onClose: () => void }) {
  const { currentUserId } = useSession();
  const store = useStore();
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [space, setSpace] = useState<string>(SPACES[0]);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("normal");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim() || !currentUserId) return;
    setBusy(true);
    try {
      const postId = await store.createPost({
        authorId: currentUserId,
        title: title.trim(),
        body: body.trim(),
        space,
        priority,
      });
      onClose();
      navigate({ to: "/posts/$postId", params: { postId } });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">new post</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] transition hover:text-fg"
          >
            ✕
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder="what's this about? write a clear title."
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-base font-medium outline-none focus:border-accent/50"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          placeholder="share the full context. posts are durable, write it so someone finds it in search next quarter."
          className="mb-3 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm outline-none focus:border-accent/50"
        />

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">space</span>
            <select
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-accent/50"
            >
              {SPACES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">priority</span>
            <div className="flex gap-1">
              {PRIORITIES.map((pr) => (
                <button
                  key={pr}
                  onClick={() => setPriority(pr)}
                  className={`rounded-md border px-2.5 py-1 text-xs lowercase transition ${
                    priority === pr
                      ? priorityStyles[pr].className
                      : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-fg"
                  }`}
                >
                  {pr}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-[var(--color-muted)] transition hover:text-fg"
          >
            cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim() || !body.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:opacity-40"
          >
            {busy ? "posting…" : "post"}
          </button>
        </div>
      </div>
    </div>
  );
}
