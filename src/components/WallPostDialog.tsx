import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { PRIORITIES, priorityStyles } from "../lib/format";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { Button } from "./Button";

export function WallPostDialog({
  wallOwnerId,
  wallOwnerName,
  onClose,
}: {
  wallOwnerId: Id<"users">;
  wallOwnerName: string;
  onClose: () => void;
}) {
  const { currentUserId } = useSession();
  const store = useStore();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("normal");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!body.trim() || !currentUserId) return;
    setBusy(true);
    try {
      await store.createPost({
        authorId: currentUserId,
        title: title.trim() || `note for ${wallOwnerName}`,
        body: body.trim(),
        space: "Wall",
        priority,
        wallOwnerId,
      });
      onClose();
      navigate({ to: "/u/$userId", params: { userId: wallOwnerId } });
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
          <h2 className="text-lg font-semibold">post on {wallOwnerName}'s wall</h2>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] transition hover:text-fg"
          >
            close
          </button>
        </div>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          placeholder={`note for ${wallOwnerName}`}
          className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-base font-medium outline-none focus:border-accent/50"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={7}
          placeholder="leave context for their wall. fenced code blocks with ``` work here."
          className="mb-3 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm outline-none focus:border-accent/50"
        />

        <div className="mb-4 flex items-center gap-2 text-sm">
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

        <div className="flex justify-end gap-2">
          <Button variant="quiet" onClick={onClose}>
            cancel
          </Button>
          <Button onClick={submit} disabled={busy || !body.trim() || !currentUserId}>
            {busy ? "posting…" : "post"}
          </Button>
        </div>
      </div>
    </div>
  );
}
