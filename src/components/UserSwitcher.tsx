import { useState, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { usePopoverDismiss } from "../lib/usePopoverDismiss";
import { Avatar } from "./Avatar";
import { AgentTag } from "./AgentTag";
import { UserRoleTag } from "./UserRoleTag";

export function UserSwitcher() {
  const { users, currentUser, setCurrentUserId } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  usePopoverDismiss(ref, () => setOpen(false));

  if (!currentUser) return null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1.5 pr-2.5 pl-1.5 transition hover:bg-surface-2"
      >
        <Avatar user={currentUser} size={28} />
        <span className="hidden max-w-[8rem] truncate text-sm font-medium whitespace-nowrap sm:inline">
          {currentUser.name}
        </span>
        {currentUser.isAgent && <AgentTag className="hidden sm:inline-flex" />}
        <UserRoleTag role={currentUser.role} className="hidden sm:inline-flex" />
        <span className="text-muted">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full z-20 mb-2 w-64 overflow-hidden rounded-lg border border-border bg-surface shadow-2xl">
          <div className="border-b border-border px-3 py-2 text-[11px] font-medium text-muted">
            view as teammate
          </div>
          {users.map((u) => (
            <div
              key={u._id}
              className={`flex w-full items-center gap-2.5 px-3 py-2 transition hover:bg-surface-2 ${
                u._id === currentUser._id ? "bg-surface-2" : ""
              }`}
            >
              <button
                onClick={() => {
                  setCurrentUserId(u._id);
                  setOpen(false);
                }}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <Avatar user={u} size={28} />
                <div className="min-w-0 leading-tight">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm">{u.name}</span>
                    {u.isAgent && <AgentTag />}
                    <UserRoleTag role={u.role} />
                  </div>
                  <div className="truncate text-[11px] text-muted">
                    {u.title}
                  </div>
                </div>
              </button>
              <Link
                to="/u/$userId"
                params={{ userId: u._id }}
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-muted transition hover:text-accent-soft"
                title={`${u.name}'s wall`}
              >
                wall →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
