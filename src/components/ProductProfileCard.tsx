import { useClerk } from "@clerk/clerk-react";
import { Link } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { UserRoleTag } from "./UserRoleTag";
import { Skeleton } from "./Skeleton";

export function ProductProfileCard() {
  const { signOut } = useClerk();
  const { currentUser } = useSession();

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
          <Link to="/app/settings" className="inline-flex min-h-9 items-center rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-fg transition-colors hover:border-accent/50 hover:bg-surface-2">
            settings
          </Link>
          <Button variant="quiet" size="sm" onClick={() => void signOut()}>
            sign out
          </Button>
        </div>
      </section>
    </div>
  );
}
