import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { SPACES, PRIORITIES, priorityStyles } from "../lib/format";

function ChevronUpIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function QuickPostBar() {
  const { currentUserId } = useSession();
  const store = useStore();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [space, setSpace] = useState<string>(SPACES[0]);
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("normal");
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
      void navigate({ to: "/posts/$postId", params: { postId } });
    } finally {
      setBusy(false);
    }
  };

  const reveal = () => {
    setOpen(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  return (
    <div className="group pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4">
      {/* At rest, only the handle peeks above the viewport edge; hover or focus
          pops the full composer into view. Retract eases out; pop uses a gentle
          spring so it lands with a soft bounce instead of a wobble. */}
      <div className="pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/95 shadow-2xl backdrop-blur will-change-transform transform-gpu translate-y-[calc(100%_-_2.25rem)] transition-transform duration-200 ease-out group-hover:translate-y-0 group-hover:duration-300 group-hover:ease-spring group-focus-within:translate-y-0 group-focus-within:duration-300 group-focus-within:ease-spring motion-reduce:transition-none">
        {/* Peek handle — the only part visible at rest. Hover or click to reveal. */}
        <button
          type="button"
          onClick={reveal}
          aria-label="start a post"
          className="flex h-9 w-full items-center justify-center gap-2 text-xs text-[var(--color-muted)] transition hover:text-fg"
        >
          <span className="text-accent-soft">+</span>
          <span>start a post…</span>
          <ChevronUpIcon className="size-3.5 text-[var(--color-faint)] transition-transform duration-200 group-hover:rotate-180 group-hover:text-[var(--color-muted)]" />
        </button>

        <div className="px-3 pb-3 pt-1">
          {open && (
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="title — what's this about?"
              className="mb-2 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm font-medium outline-none focus:border-accent/50"
            />
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={body}
              onFocus={() => setOpen(true)}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  void submit();
                }
              }}
              rows={open ? 3 : 1}
              placeholder="share context, a decision, or a question…"
              className="min-h-[2.5rem] w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus:border-accent/50"
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
              <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                space
                <select
                  value={space}
                  onChange={(event) => setSpace(event.target.value)}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs outline-none"
                >
                  {SPACES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                priority
                <div className="flex gap-1">
                  {PRIORITIES.map((pr) => (
                    <button
                      key={pr}
                      onClick={() => setPriority(pr)}
                      className={`rounded-md border px-2 py-0.5 text-xs lowercase transition ${
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

              <button
                onClick={reset}
                className="ml-auto text-xs text-[var(--color-muted)] transition hover:text-fg"
              >
                cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
