import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { usePopoverDismiss } from "../lib/usePopoverDismiss";
import { useSession } from "../lib/session";
import { AgentTag } from "./AgentTag";
import { Avatar } from "./Avatar";
import { UserRoleTag } from "./UserRoleTag";

export function UserSwitcher() {
  const { users, currentUser, setCurrentUserId } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  usePopoverDismiss(rootRef, () => setOpen(false));

  useEffect(() => {
    if (open) selectedRef.current?.focus();
  }, [open]);

  if (!currentUser) return null;

  return (
    <div className="relative w-full shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pl-1.5 pr-2.5 text-left transition-colors hover:bg-surface-2"
      >
        <Avatar user={currentUser} size={28} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{currentUser.name}</span>
        {currentUser.isAgent ? <AgentTag className="hidden lg:inline-flex" /> : null}
        <UserRoleTag role={currentUser.role} className="hidden lg:inline-flex" />
        <ChevronIcon />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="View as teammate"
          className="absolute bottom-full left-0 z-50 mb-2 max-h-[min(28rem,65vh)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-[0_16px_42px_rgba(0,0,0,0.55)]"
        >
          <p className="px-3 py-2 text-xs font-medium text-muted">View as teammate</p>
          {users.map((user) => {
            const selected = user._id === currentUser._id;
            return (
              <div key={user._id} className={`flex items-center gap-1 rounded-md ${selected ? "bg-surface-2" : ""}`}>
                <button
                  ref={selected ? selectedRef : undefined}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => {
                    setCurrentUserId(user._id);
                    setOpen(false);
                  }}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <Avatar user={user} size={28} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-fg">{user.name}</span>
                      {user.isAgent ? <AgentTag /> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-label text-muted">{user.title}</span>
                  </span>
                  {selected ? <span className="text-xs text-accent-soft">selected</span> : null}
                </button>
                <Link
                  to="/app/u/$userId"
                  params={{ userId: user._id }}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-label text-muted transition-colors hover:bg-surface-2 hover:text-accent-soft"
                  aria-label={`Open ${user.name}'s wall`}
                >
                  wall
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-4 shrink-0 text-muted" aria-hidden="true">
      <path d="m8 10 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
