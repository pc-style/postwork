import { useNavigate } from "@tanstack/react-router";
import type { EnrichedPost } from "../lib/types";
import { useSession } from "../lib/session";
import { isLocalId, useStore } from "../lib/store";
import { AnchoredConfirmation } from "./AnchoredConfirmation";
import { Button } from "./Button";

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

  if (!currentUserId) return null;

  const isAuthor = post.authorId === currentUserId;
  const isAdmin = currentUser?.role === "admin";
  const local = isLocalId(post._id);
  const canEdit = isAuthor && (store.mode === "product" || local);
  const canDelete =
    (store.mode === "product" || local) &&
    (isAuthor || (isAdmin && store.mode === "product"));

  if (!canEdit && !canDelete) return null;

  return (
    <div className="mt-2 flex min-h-9 flex-wrap items-center gap-1 text-xs">
      {canEdit ? (
        <Button
          variant="quiet"
          size="sm"
          className="min-h-9 px-1.5 text-xs"
          onClick={onStartEdit}
        >
          edit
        </Button>
      ) : null}
      {canDelete ? (
        <AnchoredConfirmation
          triggerLabel="delete"
          title="Delete this post?"
          description="This permanently deletes the post and all replies."
          confirmLabel="delete post"
          onConfirm={async () => {
            await store.deletePost({ postId: post._id });
            await navigate({ to: "/app" });
          }}
        />
      ) : null}
    </div>
  );
}
