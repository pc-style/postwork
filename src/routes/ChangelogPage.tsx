import { Link } from "@tanstack/react-router";
import { useDocumentTitle } from "../lib/useDocumentTitle";

type Change = {
  date: string;
  title: string;
  summary: string;
  details: readonly string[];
};

const changes: readonly Change[] = [
  {
    date: "11 July 2026",
    title: "a calmer way to catch up",
    summary:
      "The new catch-up view turns unread work into a short, priority-aware briefing without changing what you have read.",
    details: [
      "Unread posts are grouped by urgency and ordered by recent thread activity.",
      "Fresh, stale, and missing summaries are identified without hiding the underlying post.",
      "Catch-up respects organization and space access for every viewer.",
    ],
  },
  {
    date: "11 July 2026",
    title: "posts can carry the work now",
    summary:
      "Posts and replies now support images, video, files, trusted embeds, and GIFs while keeping uploads and downloads deliberately constrained.",
    details: [
      "Images and video render inline; generic files download through an inert file path.",
      "Direct MP4 and WebM links wait for playback before contacting their host.",
      "Feed rows once again include enough pretext to understand a post before opening it.",
    ],
  },
  {
    date: "11 July 2026",
    title: "spaces and access grew up",
    summary:
      "Space creation now follows member roles, and invitations can be reserved for a specific GitHub handle or email address.",
    details: [
      "Targeted invites can only be redeemed by the intended identity.",
      "Matching invites are claimed automatically when that person signs in.",
      "Admin lists and controls were rebuilt around the same permissions model.",
    ],
  },
  {
    date: "10 July 2026",
    title: "better signal, less waiting",
    summary:
      "Priority-aware notification preferences, summary freshness, and faster post navigation make the feed easier to triage.",
    details: [
      "AI summaries are marked stale when a thread moves on.",
      "Post data is prefetched from intent, avoiding most loading flashes on navigation.",
      "Optional error reporting and explicit public-demo behavior improve operational clarity.",
    ],
  },
];

export function ChangelogPage() {
  useDocumentTitle("changelog — postwork");

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
            changelog
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-muted [text-wrap:pretty]">
            a kept record of what changed in postwork, why it matters, and what
            you can use now.
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
                  <p className="mt-3 max-w-xl text-sm leading-6 text-muted [text-wrap:pretty]">
                    {change.summary}
                  </p>
                  <ul className="mt-5 max-w-xl space-y-2 text-sm leading-6 text-muted">
                    {change.details.map((detail) => (
                      <li key={detail} className="grid grid-cols-[0.75rem_1fr] gap-2">
                        <span aria-hidden="true" className="text-faint">
                          —
                        </span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </main>

        <footer className="mt-24 flex items-center justify-between border-t border-border pt-6 text-xs text-faint">
          <span>postwork</span>
          <Link to="/app" className="transition-colors hover:text-muted">
            open app →
          </Link>
        </footer>
      </div>
    </div>
  );
}
