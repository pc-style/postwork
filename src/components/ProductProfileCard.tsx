import { useEffect, useState } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useSession } from "../lib/session";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { UserRoleTag } from "./UserRoleTag";

function normalizeInitials(value: string): string {
  return value.replace(/\s+/g, "").slice(0, 2).toUpperCase();
}

export function ProductProfileCard() {
  const { signOut } = useClerk();
  const { currentUser, users } = useSession();
  const updateProfile = useMutation(api.users.updateProfile);
  const setRole = useMutation(api.users.setRole);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => ({
    name: currentUser?.name ?? "",
    title: currentUser?.title ?? "",
    initials: currentUser?.initials ?? "",
  }));

  useEffect(() => {
    if (!currentUser || editing) return;
    setDraft({
      name: currentUser.name,
      title: currentUser.title,
      initials: currentUser.initials,
    });
  }, [currentUser, editing]);

  if (!currentUser) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
        loading profile…
      </div>
    );
  }

  const teammates = users.filter((user) => user._id !== currentUser._id && !user.isAgent);
  const isAdmin = currentUser.role === "admin";

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

        {editing ? (
          <form
            className="mt-4 space-y-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              setError(null);
              void updateProfile({
                name: draft.name.trim(),
                title: draft.title.trim(),
                initials: normalizeInitials(draft.initials || draft.name),
              })
                .then(() => setEditing(false))
                .catch((nextError: unknown) => {
                  setError(
                    nextError instanceof Error
                      ? nextError.message
                      : "Could not save profile.",
                  );
                })
                .finally(() => setSaving(false));
            }}
          >
            <label className="block">
              <span className="mb-1 block text-label text-muted">name</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, name: event.target.value }))
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-label text-muted">title</span>
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, title: event.target.value }))
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-label text-muted">initials</span>
              <input
                value={draft.initials}
                maxLength={2}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    initials: normalizeInitials(event.target.value),
                  }))
                }
                className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm uppercase text-fg outline-none focus:border-accent/50"
              />
            </label>
            {error ? <p className="text-label text-urgent">{error}</p> : null}
            <div className="flex items-center justify-between gap-2">
              <Button variant="quiet" onClick={() => setEditing(false)}>
                cancel
              </Button>
              <Button disabled={saving || !draft.name.trim() || !draft.title.trim()}>
                {saving ? "saving…" : "save profile"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              edit profile
            </Button>
            <Button variant="quiet" size="sm" onClick={() => void signOut()}>
              sign out
            </Button>
          </div>
        )}
      </section>

      {isAdmin ? (
        <section className="rounded-lg border border-border bg-surface p-4 text-sm">
          <div className="mb-3">
            <p className="text-label font-medium text-muted">admin</p>
            <p className="mt-1 text-muted">promote or demote teammates.</p>
          </div>
          <div className="space-y-2.5">
            {teammates.length === 0 ? (
              <p className="text-muted">no other teammates yet.</p>
            ) : (
              teammates.map((user) => (
                <div
                  key={user._id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-fg">{user.name}</span>
                      <UserRoleTag role={user.role} />
                    </div>
                    <p className="truncate text-label text-muted">{user.title}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      void setRole({
                        userId: user._id,
                        role: user.role === "admin" ? "member" : "admin",
                      })
                    }
                  >
                    {user.role === "admin" ? "make member" : "make admin"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
