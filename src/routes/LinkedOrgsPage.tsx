import { Link } from "@tanstack/react-router";
import { useSpaces } from "../lib/spaces";
import { OrgSquare } from "../components/OrgSquare";

export function LinkedOrgsPage() {
  const { orgs, myOrg, allSpaces, membershipsForSpace } = useSpaces();

  return (
    <div>
      <Link to="/spaces" className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-fg">
        ← spaces
      </Link>

      <div className="mb-5">
        <h1 className="text-xl font-semibold text-fg">linked orgs</h1>
        <p className="mt-1 text-sm text-muted">
          admin view of external organizations connected through shared spaces.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {orgs
          .filter((org) => org.id !== myOrg.id)
          .map((org) => {
          const shared = allSpaces
            .map((space) => {
              const members = membershipsForSpace(space.id);
              const myMembership = members.find((member) => member.org.id === myOrg.id);
              const orgMembership = members.find((member) => member.org.id === org.id);
              return myMembership && orgMembership
                ? { space, status: orgMembership.status }
                : null;
            })
            .filter((entry): entry is { space: (typeof allSpaces)[number]; status: "active" | "invited" | "declined" } => entry !== null);

          return (
            <div key={org.id} className="grid gap-3 border-b border-border p-4 last:border-b-0 md:grid-cols-[220px_1fr]">
              <div className="flex items-center gap-3">
                <OrgSquare org={org} />
                <div>
                  <div className="text-sm font-medium text-fg">{org.name}</div>
                  <div className="text-xs text-muted">@{org.handle}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {shared.length === 0 ? (
                  <span className="text-sm text-muted">no shared spaces</span>
                ) : (
                  shared.map(({ space, status }) => (
                    <Link key={space.id} to="/spaces/$slug" params={{ slug: space.slug }} className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-accent/40 hover:text-fg">
                      <span className="text-fg">{space.name}</span> <span>· {status}</span>
                    </Link>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
