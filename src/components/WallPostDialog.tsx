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
      title={`Post on ${wallOwnerName}'s wall`}
      description="Add a note that remains attached to this profile."
      onClose={onClose}
    >
      <PostForm
        requireTitle={false}
        titlePlaceholder={`Example: Note for ${wallOwnerName}`}
        titleHelp="Add a title or leave it blank to use the default."
        bodyPlaceholder={`Write a note for ${wallOwnerName}.`}
        onCancel={onClose}
        onSubmit={async ({ title, body, priority, attachments }) => {
          if (!currentUserId) throw new Error("Choose a teammate before posting.");
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
