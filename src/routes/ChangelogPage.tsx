import { Link } from "@tanstack/react-router";
import { useDocumentTitle } from "../lib/useDocumentTitle";

type Change = {
  date: string;
  title: string;
  note: string;
};

const changes: readonly Change[] = [
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
