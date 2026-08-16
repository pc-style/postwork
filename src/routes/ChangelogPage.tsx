import { Link } from "@tanstack/react-router";
import { useDocumentTitle } from "../lib/useDocumentTitle";

type Change = {
  date: string;
  title: string;
  note: string;
};

const changes: readonly Change[] = [
  {
    date: "16 August 2026",
    title: "your workspace data is yours: one-click json export",
    note: "admins get a workspace export card on the admin overview: members, spaces, posts, and replies stream down in pages and land as a single json file. token identifiers, emails, and secrets never leave the server.",
  },
  {
    date: "16 August 2026",
    title: "approving an access request now emails the invite",
    note: "the approve button used to mint a code an admin had to copy out of the invites list and deliver by hand. now the requester gets their join link by email automatically, and creating an invite targeted at an email address delivers itself the same way. one send per invite, idempotent, silent on demo deployments — the code stays visible in the admin ui as a manual fallback.",
  },
  {
    date: "16 August 2026",
    title: "x pulse learned analytics: followers, views, and a daily digest",
    note: "the x cross-post connector now snapshots follower counts and per-post engagement (views, likes, reposts, replies) every hour, and once a day the connector agent posts a digest: follower delta, top posts of the last 24 hours with stats and links. one digest per local day, race-safe. the thing you check twitter for now actually lives in postwork.",
  },
  {
    date: "16 August 2026",
    title: "space managers can actually manage members now",
    note: "the member roster on a space page grew controls for managers and org admins: add anyone from the org directory (agents included), remove members, and promote or demote managers — all inline on the chips. private spaces stop depending on invites as the only way in.",
  },
  {
    date: "16 August 2026",
    title: "postwork now emails you before you forget it exists",
    note: "the outbound notification pipeline finally has a driver: a scheduler ticks every 30 minutes, sends one email the moment something urgent lands (deduped per urgent-post set), and one daily digest of unread activity released when your quiet hours end. reading a post in the app removes it from future emails, and every send is idempotent — no double delivery, ever. requires a configured resend provider; demo stays email-free.",
  },
  {
    date: "16 August 2026",
    title: "switch workspaces without signing out",
    note: "accounts that belong to more than one organization get a workspace picker in the profile rail. picking one flips the whole session — feed, spaces, queue — to that org. space creation now offers public or private visibility up front, space pages show private and archived states, public spaces have join/leave, and managers can archive or unarchive from the space header.",
  },
  {
    date: "16 August 2026",
    title: "one account, many workspaces",
    note: "membership moved into its own table, so a single account can belong to several organizations: redeeming an invite for a second workspace now adds it instead of erroring. moderation (deactivate, reactivate, role changes) writes through the membership records, admin checks read them as the source of truth, and an org can never demote its last admin.",
  },
  {
    date: "16 August 2026",
    title: "spaces learned visibility, managers, and archives",
    note: "spaces can now be public (anyone in the org can read and post) or private (members only, admins excepted). creators become managers, managers can rename, archive, and manage members, archived spaces turn read-only, and invites can target a specific space so redeeming one drops you straight into it.",
  },
  {
    date: "5 August 2026",
    title: "one font size, hierarchy from color",
    note: "beta feedback said the 11px meta text was too small, and the fix went deeper than a bump: the small label size is gone from the type scale entirely. chips, tags, meta rows, and small buttons now share the same 14px body size as everything else, with hierarchy carried by color and spacing instead of shrinking the font. tags stay compact through tighter padding, not tinier text.",
  },
  {
    date: "5 August 2026",
    title: "feed cards show media, images travel lighter, the app loads faster",
    note: "posts with images or link embeds now surface a cover on the feed card, with a persisted compact/regular toggle in the feed header. image attachments are re-encoded to webp (2000px cap, smaller-file-wins) at upload, so photos land around 8-15x lighter. the main js bundle was split from 929kb to under 400kb with route-level chunks that prefetch on hover, and the design system is now codified in docs/design-system.md.",
  },
  {
    date: "5 August 2026",
    title: "one design system, one sign-in path",
    note: "a full polish sweep from beta feedback: selection no longer shifts rows (color instead of weight, everywhere), the sidebar always highlights the page you are actually on, back buttons and the duplicate settings entry are gone, chips share one shape, type collapsed to five sizes, and lowercase is enforced across the app. posts open at the top instead of mid-scroll, the reply box starts tall enough to see your text and can no longer eat it on resize, saves disable until something changed, and sign-in was rebuilt as a single mobile-first flow: authenticate first, then enter an invite code, request access, or start a workspace.",
  },
  {
    date: "30 July 2026",
    title: "a six-discipline polish sweep plus a react checkup",
    note: "ran accessibility, layout, typography, ui-polish, writing, and color passes over the core app: skip link and named landmarks, real focus traps and escape/restore in pickers and the user switcher, semantic post form with inline errors, logical properties and calmer reply separators for layout, balanced headings, tabular numbers and 70ch prose measure, layered dialog shadows, avatar/media outlines and press feedback, empty states and errors that say what to do next, and accent colors nudged to pass contrast without leaving the wine palette. react doctor then cleared all six error-level findings: stable popover-dismiss listeners, module-scope notification-hook selection, and pure sidebar-width state updaters.",
  },
  {
    date: "30 July 2026",
    title: "your reply no longer hides from you",
    note: "replying inside a collapsed subthread now expands it immediately, so your fresh reply shows up instead of disappearing behind a “show 1 reply” button.",
  },
  {
    date: "30 July 2026",
    title: "unread counts are now doors, not decorations",
    note: "the unread and urgent counters in the mobile header and sidebar queue are clickable: unread opens the feed filtered to unread posts, urgent opens the priority view.",
  },
  {
    date: "30 July 2026",
    title: "sign-in remembers where you were going",
    note: "opening a deep link like /app/settings while signed out now returns you to that exact page after signing in, instead of dropping you on home. the sign-in page also got a mobile remodel: the sign-in card comes first, the invite/request-access block moved below it, and the double border inside the card is gone.",
  },
  {
    date: "29 July 2026",
    title: "link cards now read like discord embeds",
    note: "generic link previews switched from a thin row with a side thumbnail to a stacked card: accent bar on the left, site name, title, up to three description lines, and a large image below, capped at a readable width.",
  },
  {
    date: "27 July 2026",
    title: "ask an agent stops stacking and the sidebar stretches",
    note: "the agent-tasks header keeps “ask an agent” on one line instead of wrapping word-by-word in the narrow rail, and the post-page agent sidebar can be drag-resized (persisted) with keyboard arrow support.",
  },
  {
    date: "27 July 2026",
    title: "shared links now show what is behind them",
    note: "http and https links in posts and replies are now clickable outside code, and ordinary web links fetch cached title, description, site, and image metadata instead of showing a hostname-only placeholder.",
  },
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
    note: "the browser tab title shows your unread count, like (3) postwork, so a pinned tab tells you when something moved without opening it.",
  },
  {
    date: "27 July 2026",
    title: "the demo shows what a connector agent brings home",
    note: "the demo org now has an X Pulse connector agent that posts a daily x analytics digest: impressions, follows, the top post, and which mentions need a human reply. seeded data for now; it prototypes the inbound cross-posting flow where the thing you check twitter for lives in a post instead.",
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
            className="text-title font-semibold tracking-tight transition-colors hover:text-accent-soft"
          >
            post<span className="text-accent">work</span>
          </Link>
          <nav aria-label="Public navigation" className="flex items-center gap-5">
            <Link to="/" className="text-body text-muted transition-colors hover:text-fg">
              home
            </Link>
            <Link to="/app" className="text-body text-muted transition-colors hover:text-fg">
              open app
            </Link>
          </nav>
        </header>

        <main className="mt-20 md:mt-28">
          <h1 className="max-w-xl text-display font-semibold leading-tight tracking-[-0.04em]">
            dev changelog
          </h1>
          <p className="mt-6 max-w-lg text-title leading-7 text-muted [text-wrap:pretty]">
            stuff i shipped recently.
          </p>

          <div className="mt-20 border-t border-border">
            {changes.map((change) => (
              <article
                key={`${change.date}-${change.title}`}
                className="grid gap-4 border-b border-border py-10 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-8"
              >
                <time className="text-body leading-6 text-faint">{change.date}</time>
                <div>
                  <h2 className="max-w-lg text-display font-semibold tracking-tight [text-wrap:balance]">
                    {change.title}
                  </h2>
                  <p className="mt-3 max-w-xl text-body leading-6 text-muted">
                    {change.note}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </main>

        <footer className="mt-24 flex items-center justify-between border-t border-border pt-6 text-body text-faint">
          <span>postwork</span>
          <Link to="/app" className="transition-colors hover:text-muted">
            open app
          </Link>
        </footer>
      </div>
    </div>
  );
}
