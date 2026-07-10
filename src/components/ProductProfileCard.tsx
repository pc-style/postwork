import { useState } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useSession } from "../lib/session";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { ProfileDialog } from "../components/ProfileDialog";
import { UserRoleTag } from "./UserRoleTag";
import { Skeleton } from "./Skeleton";

export function ProductProfileCard() {
  const { signOut } = useClerk();
  const { currentUser } = useSession();
  const [dialogOpen, setDialogOpen] = useState(false);

  if (!currentUser) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <Skeleton label="Loading profile" preset="inline" count={2} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <div className="flex items-start gap-3">
          <Avatar user={currentUser} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-medium text-fg">{currentUser.name}</p>
              <UserRoleTag role={currentUser.role} />
            </div>
            <p className="mt-1 truncate text-muted">{currentUser.title}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDialogOpen(true)}>
            edit profile
          </Button>
          <Button variant="quiet" size="sm" onClick={() => void signOut()}>
            sign out
          </Button>
        </div>
        <ProfileDialog
          mode="edit"
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
        />
      </section>
    </div>
  );
}
