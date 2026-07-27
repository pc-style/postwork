import { Link } from "@tanstack/react-router";
import { useDocumentTitle } from "../lib/useDocumentTitle";

type Change = {
  date: string;
  title: string;
  note: string;
};

const changes: readonly Change[] = [
  {
    date: "27 July 2026",
    title: "workspaces got their own addresses",
    note: "new workspace setup now includes a unique slug and previews its postwork.pcstyle.dev address. admins can update that address in settings, and tenant subdomains guide signed-in users back to their canonical workspace.",
  },
  {
    date: "27 July 2026",
    title: "browser notifications follow your account",
    note: "signed-in product users now keep their browser-notification preference in convex, so the setting follows their account. the public demo still stores the toggle only in that browser.",
  },
  {
    date: "27 July 2026",
    title: "settings got a real home",
    note: "/app/settings now has its own sidebar for profile, agents, and notifications. profile editing moved there, admins can configure x cross-posting per org, and teammates can opt into browser notifications.",
  },
  {
    date: "27 July 2026",
    title: "each team can bring its x posts into postwork",
    note: "admins can now configure their team's x handle in postwork instead of relying on deployment settings. the scheduled sync mirrors every configured team's new posts through its own X Pulse connector agent, isolates failures by handle, and still dedupes by tweet id without x api keys.",
  },
  {
    date: "27 July 2026",
    title: "a pinned tab is now a notification",
    note: "the browser tab title shows your unread count — (3) postwork — so a pinned tab tells you when something moved without opening it.",
  },
  {
    date: "27 July 2026",
    title: "the demo shows what a connector agent brings home",
    note: "the demo org now has an X Pulse connector agent that posts a daily x analytics digest: impressions, follows, the top post, and which mentions need a human reply. seeded data for now — it prototypes the inbound cross-posting flow where the thing you check twitter for lives in a post instead.",
  },
  {
    date: "27 July 2026",
    title: "hierarchy, alignment, and a collapsible sidebar",
    note: "the agent sidebar got a divider line and a hide toggle that collapses it to a slim rail. post and reply bodies dropped to 80% opacity so titles and names carry the weight. breadcrumb dead space tightened and the summary teaser skips its bare TL;DR label.",
  },
  {
    date: "27 July 2026",
    title: "less is more, everywhere",
    note: "the reply composer idles as a single line and expands on focus. feed cards hide the space chip and ai-summary label until hover, and normal priority is no longer chipped. stale summaries show a quiet dot, disclosure panels animate in, and the sticky sidebar scrolls instead of clipping.",
  },
  {
    date: "27 July 2026",
    title: "the post page calmed down",
    note: "agent summary and agent tasks moved to a sticky right sidebar on wide screens, and the summary collapses to a one-line teaser strip. quiet buttons got hairline borders and real padding, and edit, delete, and ask-agent actions hover-reveal instead of always showing.",
  },
  {
    date: "21 July 2026",
    title: "teams get their own front door",
    note: "you can create an organization and invite people straight into it, with onboarding scoped to your org.",
  },
  {
    date: "15 July 2026",
    title: "the demo and the product went separate ways",
    note: "two isolated deployments now, so demo experiments can't touch real team data.",
  },
  {
    date: "15 July 2026",
    title: "agents connected to the outside world",
    note: "connector auth, a task runner for connected agents, and github webhook ingestion landed.",
  },
  {
    date: "13 July 2026",
    title: "notifications leave the app now",
    note: "important posts can reach teammates by email, with retries when delivery fails.",
  },
  {
    date: "13 July 2026",
    title: "invites and dialogs stopped fighting you",
    note: "account switching, keyboard focus, and the mobile demo switcher now behave properly.",
  },
  {
    date: "12 July 2026",
    title: "demo data stays in the demo",
    note: "organizations now isolate their own posts, spaces, people, and notifications.",
  },
  {
    date: "11 July 2026",
    title: "catch up without digging through the feed",
    note: "new catch-up page sorts unread posts by priority and recent activity.",
  },
  {
    date: "11 July 2026",
    title: "attachments work properly now",
    note: "posts and replies support images, videos, files, embeds, and gifs.",
  },
  {
    date: "11 July 2026",
    title: "targeted invites and space roles",
    note: "admins can invite a specific github handle or email and control who creates spaces.",
  },
  {
    date: "10 July 2026",
    title: "faster posts and smarter summaries",
    note: "posts prefetch before you open them and old ai summaries get marked stale.",
  },
  {
    date: "10 July 2026",
    title: "agents got real work to do",
    note: "agent tasks, model settings, OpenRouter support, and priority-aware notifications landed.",
  },
  {
    date: "9 July 2026",
    title: "signup became invite only",
    note: "new teammates now need an invite and finish their profile before entering the app.",
  },
  {
    date: "8 July 2026",
    title: "the prototype became a product",
    note: "auth, profiles, invites, admin tools, moderation, and the public landing page came together.",
  },
  {
    date: "4 July 2026",
    title: "the ink redesign landed",
    note: "the app moved to the warmer, quieter interface it still uses today.",
  },
  {
    date: "3 July 2026",
    title: "the demo stopped trusting everyone",
    note: "public mutations were locked down, organization visibility was fixed, and the ui got a full cleanup.",
  },
  {
    date: "29 June 2026",
    title: "product experiments went live",
    note: "the lab added persistent variants, voting, comparisons, and open discussion threads.",
  },
  {
    date: "24 June 2026",
    title: "first serious build",
    note: "posts, nested replies, search, unread state, priorities, summaries, and agent activity worked end to end.",
  },
];

export function ChangelogPage() {
  useDocumentTitle("dev changelog | postwork");

  return (
    <div className="theme-ink min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-3xl px-6 pt-20 pb-24 md:pt-28">
        <header className="flex items-center justify-between gap-6">
          <Link
            to="/"
            className="text-base font-semibold tracking-tight transition-colors hover:text-accent-soft"
          >
            post<span className="text-accent">work</span>
          </Link>
          <nav aria-label="Public navigation" className="flex items-center gap-5">
            <Link to="/" className="text-xs text-muted transition-colors hover:text-fg">
              home
            </Link>
            <Link to="/app" className="text-xs text-muted transition-colors hover:text-fg">
              open app
            </Link>
          </nav>
        </header>

        <main className="mt-20 md:mt-28">
          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em] md:text-5xl">
            dev changelog
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted [text-wrap:pretty]">
            stuff i shipped recently.
          </p>

          <div className="mt-20 border-t border-border">
            {changes.map((change) => (
              <article
                key={`${change.date}-${change.title}`}
                className="grid gap-4 border-b border-border py-10 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-8"
              >
                <time className="text-xs leading-6 text-faint">{change.date}</time>
                <div>
                  <h2 className="max-w-lg text-xl font-semibold tracking-tight [text-wrap:balance]">
                    {change.title}
                  </h2>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
                    {change.note}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </main>

        <footer className="mt-24 flex items-center justify-between border-t border-border pt-6 text-xs text-faint">
          <span>postwork</span>
          <Link to="/app" className="transition-colors hover:text-muted">
            open app
          </Link>
        </footer>
      </div>
    </div>
  );
}
