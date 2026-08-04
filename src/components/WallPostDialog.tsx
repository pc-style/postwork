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
    <Dialog
      title={`post on ${wallOwnerName}'s wall`}
      description="add a note that remains attached to this profile."
      onClose={onClose}
    >
      <PostForm
        requireTitle={false}
        titlePlaceholder={`example: note for ${wallOwnerName}`}
        titleHelp="add a title or leave it blank to use the default."
        bodyPlaceholder={`write a note for ${wallOwnerName}.`}
        onCancel={onClose}
        onSubmit={async ({ title, body, priority, attachments }) => {
          if (!currentUserId) throw new Error("choose a teammate before posting.");
          await store.createPost({
            title: title || `note for ${wallOwnerName}`,
            body,
            space: "Wall",
            priority,
            wallOwnerId,
            attachments,
          });
          onClose();
          await navigate({ to: "/app/u/$userId", params: { userId: wallOwnerId } });
        }}
      />
    </Dialog>
  );
}
