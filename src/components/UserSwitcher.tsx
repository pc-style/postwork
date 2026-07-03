import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { Avatar } from "./Avatar";
import { AgentTag } from "./AgentTag";
import { UserRoleTag } from "./UserRoleTag";

export function UserSwitcher() {
  const { users, currentUser, setCurrentUserId } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!currentUser) return null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] py-1.5 pr-2.5 pl-1.5 transition hover:bg-[var(--color-surface-2)]"
      >
        <Avatar user={currentUser} size={28} />
        <span className="hidden max-w-[8rem] truncate text-sm font-medium whitespace-nowrap sm:inline">
          {currentUser.name}
        </span>
        {currentUser.isAgent && <AgentTag className="hidden sm:inline-flex" />}
        <UserRoleTag role={currentUser.role} className="hidden sm:inline-flex" />
        <span className="text-[var(--color-muted)]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
          <div className="border-b border-[var(--color-border)] px-3 py-2 text-[11px] font-medium text-[var(--color-muted)]">
            view as teammate
          </div>
          {users.map((u) => (
            <div
              key={u._id}
              className={`flex w-full items-center gap-2.5 px-3 py-2 transition hover:bg-[var(--color-surface-2)] ${
                u._id === currentUser._id ? "bg-[var(--color-surface-2)]" : ""
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
                  <div className="truncate text-[11px] text-[var(--color-muted)]">
                    {u.title}
                  </div>
                </div>
              </button>
              <Link
                to="/u/$userId"
                params={{ userId: u._id }}
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md px-1.5 py-1 text-[11px] text-[var(--color-muted)] transition hover:text-accent-soft"
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
