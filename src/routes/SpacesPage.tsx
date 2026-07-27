import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { timeAgo } from "../lib/format";
import { useSpaceCreationStatus, useSpacesList } from "../lib/spaces";
import { useStore } from "../lib/store";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function SpacesPage() {
  useDocumentTitle("Spaces · postwork");
  const spaces = useSpacesList().slice().sort((a, b) => b.latestActivityAt - a.latestActivityAt);
  const creationStatus = useSpaceCreationStatus();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader
        backTo="/app"
        backLabel="feed"
        title="Spaces"
        description="Browse posts grouped by team or area of work."
        action={
          <Button
            className="w-full sm:w-auto"
            disabled={!creationStatus?.canCreate}
            onClick={() => setCreating(true)}
          >
            create space
          </Button>
        }
      />

      {creationStatus && !creationStatus.canCreate ? (
        <p className="mb-4 text-xs text-muted">
          You’ve created {creationStatus.createdCount} of {creationStatus.limit} available spaces.
        </p>
      ) : null}

      {spaces.length === 0 ? (
        <EmptyState>No spaces are available yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          {spaces.map((space) => (
            <Link
              key={space._id}
              to="/app/spaces/$slug"
              params={{ slug: space.slug }}
              className="group block rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/40 hover:bg-surface-2"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-title font-semibold text-fg">{space.name}</h2>
                  {space.description ? (
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{space.description}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-3 text-xs text-muted sm:block sm:text-right">
                  <div>{space.memberCount} members</div>
                  <div className="sm:mt-1">{space.postCount} posts</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted">Active {timeAgo(space.latestActivityAt)}</div>
            </Link>
          ))}
        </div>
      )}

      {creating ? <CreateSpaceDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function CreateSpaceDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const spaces = useSpacesList();
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      const created = await store.createSpace({
        name,
        description: description.trim() || undefined,
        existingSlugs: spaces.map((space) => space.slug),
      });
      onClose();
      await navigate({
        to: "/app/spaces/$slug",
        params: { slug: created.slug },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "We couldn't create this space. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Create a space"
      description="Start a focused place for a team, project, or area of work."
      onClose={onClose}
      initialFocusRef={nameRef}
      dismissible={!saving}
    >
      <form className="grid gap-4" onSubmit={submit}>
        <FormField label="Name" required>
          <input
            ref={nameRef}
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            placeholder="Example: Launch planning"
            className="min-h-11 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-fg transition-colors placeholder:text-muted/60 focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
          />
        </FormField>
        <FormField label="Description" optional help={`${description.length}/240 characters`}>
          <textarea
            value={description}
            maxLength={240}
            rows={4}
            onChange={(event) => {
              setDescription(event.target.value);
              setError(null);
            }}
            placeholder="What belongs in this space?"
            className="w-full resize-y rounded-md border border-border bg-bg px-3 py-2 text-sm leading-6 text-fg transition-colors placeholder:text-muted/60 focus:border-accent/50 focus-visible:outline-2 focus-visible:outline-accent-soft"
          />
        </FormField>
        {error ? <p role="alert" className="ui-error">{error}</p> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" disabled={saving} onClick={onClose}>
            cancel
          </Button>
          <Button type="submit" loading={saving} loadingLabel="creating…" disabled={!name.trim()}>
            create space
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
