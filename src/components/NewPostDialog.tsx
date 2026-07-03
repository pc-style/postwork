import { useNavigate } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { Dialog } from "./Dialog";
import { PostForm } from "./PostForm";

export function NewPostDialog({ onClose }: { onClose: () => void }) {
  const { currentUserId } = useSession();
  const store = useStore();
  const navigate = useNavigate();

  return (
    <Dialog title="new post" onClose={onClose}>
      <PostForm
        showSpace
        onCancel={onClose}
        onSubmit={async ({ title, body, space, priority }) => {
          if (!currentUserId) return;
          const postId = await store.createPost({
            authorId: currentUserId,
            title,
            body,
            space: space!,
            priority,
          });
          onClose();
          navigate({ to: "/posts/$postId", params: { postId } });
        }}
      />
    </Dialog>
  );
}
