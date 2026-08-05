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
    <div className="mt-3 flex min-h-11 flex-wrap items-center gap-1.5 text-body transition-opacity sm:min-h-9 sm:opacity-0 sm:focus-within:opacity-100 sm:group-hover/post:opacity-100">
      {canEdit ? (
        <Button
          variant="quiet"
          size="sm"
          className="min-h-11 text-body sm:min-h-9"
          onClick={onStartEdit}
        >
          edit
        </Button>
      ) : null}
      {canDelete ? (
        <AnchoredConfirmation
          triggerLabel="delete"
          title="delete this post?"
          description="this permanently deletes the post and all replies."
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
