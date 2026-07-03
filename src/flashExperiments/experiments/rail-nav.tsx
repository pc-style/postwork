import { Link } from "@tanstack/react-router";
import type { FlashExperiment } from "../registry";

type RailItem = {
  label: string;
  hint?: string;
  count?: number;
  accent?: boolean;
  /** If set, the item is a real <Link> to this route. Otherwise it renders as
   * a dimmed, non-interactive placeholder so reviewers can see the rail's
   * shape without being misled into thinking every entry routes somewhere. */
  to?: string;
};

const SECTIONS: { heading: string; items: RailItem[] }[] = [
  {
    heading: "workspace",
    items: [
      { label: "inbox", count: 9, accent: true, to: "/" },
      { label: "priority", count: 2, to: "/" },
      { label: "spaces", to: "/spaces" },
      { label: "agents", hint: "3 running", to: "/agents" },
    ],
  },
  {
    heading: "orgs",
    items: [
      { label: "linked orgs", to: "/orgs" },
      { label: "Northwind" },
      { label: "Acme" },
      { label: "Globex" },
    ],
  },
];

function RailNav() {
  return (
    <nav className="rounded-lg border border-border bg-surface p-2.5 text-sm">
      {SECTIONS.map((section) => (
        <div key={section.heading} className="mb-3 last:mb-0">
          <div className="px-2 pb-1.5 text-[11px] uppercase tracking-wide text-muted">
            {section.heading}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const body = (
                <>
                  <span className="truncate">{item.label}</span>
                  {item.count !== undefined ? (
                    <span
                      className={`shrink-0 rounded-full px-1.5 text-[11px] tabular-nums ${
                        item.accent
                          ? "bg-accent/20 text-accent-soft"
                          : "border border-border text-muted"
                      }`}
                    >
                      {item.count}
                    </span>
                  ) : item.hint ? (
                    <span className="shrink-0 text-[11px] text-muted">
                      {item.hint}
                    </span>
                  ) : null}
                </>
              );

              const sharedClass = `flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition ${
                item.accent
                  ? "bg-accent/10 text-accent-soft"
                  : "text-muted"
              }`;

              if (item.to) {
                return (
                  <Link
                    key={item.label}
                    to={item.to}
                    className={`${sharedClass} hover:bg-surface-2 hover:text-fg [&.active]:text-accent-soft`}
                  >
                    {body}
                  </Link>
                );
              }

              return (
                <div
                  key={item.label}
                  className={`${sharedClass} opacity-60`}
                  title="not wired in this preview"
                >
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export const railNav: FlashExperiment = {
  slug: "rail-nav",
  title: "left rail navigation",
  summary:
    "Promote inbox, priority, spaces and agents to a persistent left rail with live unread counts instead of header tabs.",
  requestedBy: "navigation review",
  status: "rejected",
  category: "testing",
  slots: ["sidebar"],
  notes: [
    "deprecated — the shipped centered reading column already promotes inbox/priority/spaces/agents to a persistent left rail",
    "switches the real shell into its two-column path",
    "rail items with routes (inbox/spaces/agents/orgs) link to the real app",
    "items without a route are dimmed to signal they're preview-only",
  ],
  appSlots: { sidebar: <RailNav /> },
};
