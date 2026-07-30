import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import { Button } from "../../components/Button";
import { NotificationSettingsSection } from "../../components/NotificationSettingsSection";
import { ProfileSettingsForm } from "../../components/ProfileSettingsForm";
import { demoPolicy } from "../../lib/demoMode";
import { useSession } from "../../lib/session";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { workspaceUrl } from "../../lib/tenant";

const SECTIONS = ["profile", "workspace", "agents", "notifications"] as const;
type Section = (typeof SECTIONS)[number];

export function SettingsPage() {
  useDocumentTitle("settings · postwork");
  const [section, setSection] = useState<Section>("profile");

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10">
      <h1 className="type-heading text-xl font-semibold">settings</h1>
      <div className="mt-7 grid gap-8 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-12">
        <nav aria-label="settings sections" className="flex gap-1 overflow-x-auto pb-2 pe-6 md:flex-col md:overflow-visible md:p-0">
          {SECTIONS.map((item) => (
            <button
              key={item}
              type="button"
              aria-current={section === item ? "page" : undefined}
              onClick={() => setSection(item)}
              className={`min-h-10 shrink-0 rounded-md px-3 py-2 text-start text-sm transition-colors hover:bg-surface hover:text-fg ${section === item ? "bg-surface text-accent-soft" : "text-muted"}`}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="min-w-0 md:ps-10">
          {section === "profile" ? <ProfileSection /> : null}
          {section === "workspace" ? <WorkspaceSection /> : null}
          {section === "agents" ? <AgentsSection /> : null}
          {section === "notifications" ? <NotificationsSection /> : null}
        </div>
      </div>
    </div>
  );
}

function WorkspaceSection() {
  const { currentUser } = useSession();
  const me = useQuery(api.users.me, demoPolicy.productAuth ? {} : "skip");
  const setSlug = useMutation(api.orgs.setSlug);
  const [slug, setSlugDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me?.org?.slug) setSlugDraft(me.org.slug);
  }, [me]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await setSlug({ slug });
      setSlugDraft(result.slug);
    } catch (caught) {
      setError(getErrorMessage(caught, "couldn't update the workspace address. review the slug and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <SectionHeader title="workspace" description="your team's name and canonical address." />
      {!demoPolicy.productAuth ? <p className="text-sm text-muted">workspace settings are available on the product deployment.</p> : me === undefined ? <p className="text-sm text-muted">loading workspace…</p> : (
        <div className="max-w-xl rounded-md border border-border bg-surface p-4">
          <h3 className="text-sm font-medium">{me?.org?.name ?? "workspace"}</h3>
          <p className="mt-2 text-xs text-muted">{slug ? workspaceUrl(slug) : "this workspace still needs a slug."}</p>
          {currentUser?.role === "admin" ? (
            <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void save(); }}>
              <label htmlFor="workspace-slug" className="sr-only">workspace slug</label>
              <input id="workspace-slug" value={slug} onChange={(event) => { setSlugDraft(event.target.value.toLowerCase()); setError(null); }} className="ui-field font-mono" placeholder="your-team" />
              <Button type="submit" size="sm" loading={saving} loadingLabel="saving…">save workspace address</Button>
            </form>
          ) : null}
          {error ? <p role="alert" className="ui-error mt-3">{error}</p> : null}
        </div>
      )}
    </section>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h2 className="type-heading text-base font-semibold">{title}</h2>
      {description ? <p className="type-description mt-2 text-sm text-muted">{description}</p> : null}
    </header>
  );
}

function ProfileSection() {
  return (
    <section>
      <SectionHeader title="profile" description="manage how teammates see you in postwork." />
      {demoPolicy.productAuth ? <ProfileSettingsForm /> : (
        <p className="text-sm text-muted">profile editing is available on the product deployment.</p>
      )}
    </section>
  );
}

function AgentsSection() {
  const { currentUser } = useSession();
  const canConfigure = demoPolicy.productAuth && currentUser?.role === "admin";
  const status = useQuery(api.connectors.xSyncStatus, canConfigure ? {} : "skip");
  const setXSyncHandle = useMutation(api.connectors.setXSyncHandle);
  const [handle, setHandle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status) setHandle(status.handle ? `@${status.handle}` : "");
  }, [status]);

  const save = async (nextHandle: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const next = await setXSyncHandle({ handle: nextHandle });
      setHandle(next.handle ? `@${next.handle}` : "");
    } catch (caught) {
      setError(getErrorMessage(caught, "couldn't update this agent. review the handle and try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <SectionHeader title="agents" description="connect external sources as agent teammates." />
      {!canConfigure ? (
        <p className="text-sm text-muted">only org admins can configure agents.</p>
      ) : (
        <div className="max-w-xl rounded-md border border-border bg-surface p-4">
          <h3 className="text-sm font-medium">x cross-posting</h3>
          {status === undefined ? <p className="mt-3 text-sm text-muted">loading agent…</p> : (
            <>
              <p className="type-description mt-2 text-xs text-muted">
                {status.configured ? `current handle: @${status.handle}` : "not configured"}
                {status.agentName ? ` · posts as ${status.agentName}` : ""}
              </p>
              <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void save(handle); }}>
                <label htmlFor="x-sync-handle" className="sr-only">x handle</label>
                <input id="x-sync-handle" value={handle} onChange={(event) => { setHandle(event.target.value); setError(null); }} placeholder="@handle" className="ui-field" />
                <Button type="submit" size="sm" loading={saving} loadingLabel="saving…">save x handle</Button>
                {status.configured ? <Button variant="quiet" size="sm" disabled={saving} onClick={() => void save(null)}>disconnect x</Button> : null}
              </form>
              {error ? <p role="alert" className="ui-error mt-3">{error}</p> : null}
            </>
          )}
        </div>
      )}
      <p className="mt-4 max-w-xl text-xs leading-5 text-muted">new posts from this handle are mirrored into postwork every 30 minutes.</p>
    </section>
  );
}

function NotificationsSection() {
  return (
    <section>
      <SectionHeader title="notifications" description="choose how postwork gets your attention." />
      <NotificationSettingsSection />
    </section>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ConvexError) {
    const data = error.data as { message?: string };
    return data.message?.toLowerCase() ?? fallback;
  }
  return fallback;
}
