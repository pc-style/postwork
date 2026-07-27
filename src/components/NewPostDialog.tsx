import { useRef, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { Dialog } from "./Dialog";
import { PostForm } from "./PostForm";

export function NewPostDialog({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { currentUserId } = useSession();
  const store = useStore();
  const navigate = useNavigate();
  const titleRef = useRef<HTMLInputElement>(null);

  return (
    <Dialog
      title="New post"
      description="Share a durable update, decision, or question."
      onClose={onClose}
      initialFocusRef={titleRef}
      returnFocusRef={returnFocusRef}
    >
      <PostForm
        titleRef={titleRef}
        showSpace
        draftKey="postwork.newPostDraft"
        onCancel={onClose}
        onSubmit={async ({ title, body, space, spaceId, priority, attachments }) => {
          if (!currentUserId || !space) {
            throw new Error("Choose a teammate and space before posting.");
          }
          const postId = await store.createPost({
            title,
            body,
            space,
            spaceId,
            priority,
            attachments,
          });
          onClose();
          await navigate({ to: "/app/posts/$postId", params: { postId } });
        }}
      />
    </Dialog>
  );
}
