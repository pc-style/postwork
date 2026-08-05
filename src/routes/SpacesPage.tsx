import { useActionState, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button, FormSubmitButton } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { EmptyState } from "../components/EmptyState";
import { FormField } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { timeAgo } from "../lib/format";
import { useSpaceCreationStatus, useSpacesList } from "../lib/spaces";
import { useStore } from "../lib/store";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function SpacesPage() {
  useDocumentTitle("spaces · postwork");
  const spaces = useSpacesList()
    .slice()
    .sort((a, b) => b.latestActivityAt - a.latestActivityAt);
  const creationStatus = useSpaceCreationStatus();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader
        title="spaces"
        description="browse posts grouped by team or area of work."
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
        <p className="type-numeric mb-4 text-label text-muted">
          you’ve created {creationStatus.createdCount} of {creationStatus.limit} available spaces.
        </p>
      ) : null}

      {spaces.length === 0 ? (
        <EmptyState>
          {creationStatus && !creationStatus.canCreate
            ? "you’ve reached the space limit for this workspace."
            : "spaces group posts by team or area of work. create a space to start one."}
        </EmptyState>
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
                  <h2 className="type-heading text-title font-semibold text-fg">{space.name}</h2>
                  {space.description ? (
                    <p className="type-description mt-1 text-body text-muted">
                      {space.description}
                    </p>
                  ) : null}
                </div>
                <div className="type-numeric flex shrink-0 flex-wrap gap-3 text-label text-muted sm:block sm:text-end">
                  <div>{space.memberCount} members</div>
                  <div className="sm:mt-1">{space.postCount} posts</div>
                </div>
              </div>
              <div className="type-numeric mt-3 text-label text-muted">
                active {timeAgo(space.latestActivityAt)}
              </div>
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
  const [submitState, submitAction] = useActionState(
    async (_previous: { error: string | null }, formData: FormData) => {
      const nextName = String(formData.get("name") ?? "").trim();
      const nextDescription = String(formData.get("description") ?? "").trim();
      if (!nextName) return { error: "add a name for the space." };
      try {
        const created = await store.createSpace({
          name: nextName,
          description: nextDescription || undefined,
          existingSlugs: spaces.map((space) => space.slug),
        });
        onClose();
        await navigate({ to: "/app/spaces/$slug", params: { slug: created.slug } });
        return { error: null };
      } catch (caught) {
        return {
          error:
            caught instanceof Error
              ? caught.message
              : "couldn't create the space. check your connection and try again.",
        };
      }
    },
    { error: null },
  );

  return (
    <Dialog
      title="create a space"
      description="start a focused place for a team, project, or area of work."
      onClose={onClose}
      initialFocusRef={nameRef}
      dismissible
    >
      <form action={submitAction} className="grid gap-4">
        <FormField label="name" required>
          <input
            ref={nameRef}
            name="name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="example: launch planning"
            className="ui-field text-body placeholder:text-muted/60"
          />
        </FormField>
        <FormField label="description" optional help={`${description.length}/240 characters`}>
          <textarea
            value={description}
            name="description"
            maxLength={240}
            rows={4}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="what belongs in this space?"
            className="ui-field resize-y text-body leading-6 placeholder:text-muted/60"
          />
        </FormField>
        {submitState.error ? (
          <p role="alert" className="ui-error">
            {submitState.error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            cancel
          </Button>
          <FormSubmitButton loadingLabel="creating…" disabled={!name.trim()}>
            create space
          </FormSubmitButton>
        </div>
      </form>
    </Dialog>
  );
}
