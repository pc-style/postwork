import { useNavigate } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { Dialog } from "./Dialog";
import { PostForm } from "./PostForm";

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

  return (
    <Dialog title={`post on ${wallOwnerName}'s wall`} onClose={onClose}>
      <PostForm
        requireTitle={false}
        titlePlaceholder={`note for ${wallOwnerName}`}
        bodyPlaceholder="leave context for their wall. fenced code blocks with ``` work here."
        onCancel={onClose}
        onSubmit={async ({ title, body, priority }) => {
          if (!currentUserId) return;
          await store.createPost({
            authorId: currentUserId,
            title: title || `note for ${wallOwnerName}`,
            body,
            space: "Wall",
            priority,
            wallOwnerId,
          });
          onClose();
          navigate({ to: "/u/$userId", params: { userId: wallOwnerId } });
        }}
      />
    </Dialog>
  );
}
