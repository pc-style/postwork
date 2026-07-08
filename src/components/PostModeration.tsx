import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { EnrichedPost } from "../lib/types";
import { useSession } from "../lib/session";
import { useStore, isLocalId } from "../lib/store";

/**
 * Post delete action + edit trigger (Phase 3.5).
 *
 * Renders nothing when the viewer has no standing to moderate the post.
 *   - Product mode: edit is author-only, delete is author or admin.
 *   - Demo mode: only session-created (local) posts can be moderated, and
 *     only by their author — seeded backend content is read-only.
 *
 * The edit form itself lives in the post page so it can replace the title and
 * body in place; this component only owns the action row + delete confirmation.
 */
export function PostModeration({
  post,
  onStartEdit,
}: {
  post: EnrichedPost;
  onStartEdit: () => void;
}) {
  const store = useStore();
  const { currentUserId, currentUser } = useSession();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUserId) return null;

  const isAuthor = post.authorId === currentUserId;
  const isAdmin = currentUser?.role === "admin";
  const local = isLocalId(post._id);

  // Demo mode: only local (session-created) posts can be moderated, and only
  // by their author. Product mode: edit is author-only, delete is author/admin.
  const canEdit = isAuthor && (store.mode === "product" || local);
  const canDelete =
    (store.mode === "product" || local) && (isAuthor || (isAdmin && store.mode === "product"));
  if (!canEdit && !canDelete) return null;

  const confirmDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await store.deletePost({ postId: post._id });
      void navigate({ to: "/app" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete post.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex items-center gap-3 text-xs">
      {canEdit && !confirmingDelete && (
        <button
          type="button"
          onClick={onStartEdit}
          className="text-muted transition hover:text-fg"
        >
          edit
        </button>
      )}
      {canDelete && !confirmingDelete && (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="text-muted transition hover:text-urgent"
        >
          delete
        </button>
      )}
      {confirmingDelete && (
        <span className="flex items-center gap-2">
          <span className="text-faint">delete this post and all replies?</span>
          <button
            type="button"
            onClick={() => void confirmDelete()}
            disabled={busy}
            className="rounded-md bg-urgent/15 px-2 py-0.5 text-urgent transition hover:bg-urgent/25 disabled:opacity-40"
          >
            {busy ? "deleting…" : "yes, delete"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={busy}
            className="text-muted transition hover:text-fg disabled:opacity-40"
          >
            cancel
          </button>
        </span>
      )}
      {error && <span className="text-urgent">{error}</span>}
    </div>
  );
}
