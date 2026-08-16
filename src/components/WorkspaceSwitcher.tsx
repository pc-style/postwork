import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useSession } from "../lib/session";
import { tenantSlugFromHostname, workspaceUrl } from "../lib/tenant";

/**
 * Active-workspace picker. Renders nothing until the account belongs to more
 * than one organization, so single-workspace teams never see extra chrome.
 */
export function WorkspaceSwitcher() {
  const { currentUser } = useSession();
  const memberships = useQuery(api.orgs.listMine, currentUser ? {} : "skip");
  const switchActive = useMutation(api.orgs.switchActive);
  const [switching, setSwitching] = useState<Id<"orgs"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser || !memberships || memberships.length < 2) return null;

  const activeOrgId = currentUser.orgId;

  const choose = async (orgId: Id<"orgs">, slug: string | undefined) => {
    if (orgId === activeOrgId || switching) return;
    setSwitching(orgId);
    setError(null);
    try {
      await switchActive({ orgId });
      // On a tenant subdomain the URL is the workspace — follow it there.
      if (slug && tenantSlugFromHostname(window.location.hostname)) {
        window.location.assign(`${workspaceUrl(slug)}/app`);
        return;
      }
    } catch {
      setError("Couldn't switch workspaces. Try again.");
    } finally {
      setSwitching(null);
    }
  };

  return (
    <section
      className="rounded-lg border border-border bg-surface p-3 text-sm"
      aria-label="Workspaces"
    >
      <div className="mb-2 px-1 text-label font-medium text-muted">workspace</div>
      <div className="space-y-1" role="listbox" aria-label="Choose a workspace">
        {memberships.map(({ org }) => {
          const active = org._id === activeOrgId;
          return (
            <button
              key={org._id}
              type="button"
              role="option"
              aria-selected={active}
              disabled={switching !== null}
              onClick={() => void choose(org._id, org.slug)}
              className={`flex min-h-9 w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors ${
                active
                  ? "bg-surface-2 text-fg"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              <span className="truncate">{org.name}</span>
              {active ? (
                <span className="ml-2 shrink-0 font-mono text-[10px] text-accent-soft">
                  active
                </span>
              ) : switching === org._id ? (
                <span className="ml-2 shrink-0 font-mono text-[10px] text-muted">
                  …
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="mt-2 px-1 text-xs text-urgent">
          {error}
        </p>
      ) : null}
    </section>
  );
}
