import { useClerk } from "@clerk/clerk-react";
import { useSession } from "../lib/session";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { UserRoleTag } from "./UserRoleTag";
import { Skeleton } from "./Skeleton";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

export function ProductProfileCard() {
  const { signOut } = useClerk();
  const { currentUser } = useSession();

  if (!currentUser) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <Skeleton label="loading profile" preset="inline" count={2} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <WorkspaceSwitcher />
      <section className="rounded-lg border border-border bg-surface p-4 text-body">
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

        {/* settings lives once, in the sidebar nav; this card only signs out */}
        <div className="mt-4 flex justify-end">
          <Button variant="quiet" size="sm" onClick={() => void signOut()}>
            sign out
          </Button>
        </div>
      </section>
    </div>
  );
}
