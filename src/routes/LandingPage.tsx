import { Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { isDemo } from "../lib/demoMode";
import { useDocumentTitle } from "../lib/useDocumentTitle";

/**
 * Public landing at `/`. Never auth-dependent: logged-in users see it too,
 * they just get an "open app" CTA instead of "sign in".
 */
export function LandingPage() {
  useDocumentTitle("postwork: posts, not channels");
  return (
    <div className="theme-ink min-h-screen bg-bg text-fg">
      {isDemo ? <LandingContent signedIn /> : <ProductLanding />}
    </div>
  );
}

function ProductLanding() {
  const { isLoaded, isSignedIn } = useAuth();
  return <LandingContent signedIn={isLoaded && !!isSignedIn} />;
}

function LandingContent({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pb-24 sm:pt-16 md:pt-24">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <span className="text-title font-semibold tracking-tight">
          post<span className="text-accent-soft">work</span>
        </span>
        <nav aria-label="Public navigation" className="flex items-center gap-5">
          <Link
            to="/changelog"
            className="text-body text-muted transition-colors hover:text-fg"
          >
            changelog
          </Link>
          <Link
            to="/app"
            className="ui-button rounded-md border border-border px-3 py-1.5 text-body text-muted hover:border-muted hover:text-fg"
          >
            {signedIn ? "open app" : "sign in"}
          </Link>
        </nav>
      </header>

      <main className="mt-16 sm:mt-20 md:mt-28">
        <h1 className="type-heading max-w-xl text-4xl font-semibold tracking-[-0.04em] md:text-5xl">
          your team's decisions keep dying in chat.
        </h1>
        <p className="mt-6 max-w-lg text-title leading-7 text-muted [text-wrap:pretty]">
          someone asks a good question in a channel. twelve people reply. a
          decision gets made. three weeks later nobody can find it, so someone
          asks again. that loop is the whole reason postwork exists.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            to="/app"
            className="ui-button rounded-md bg-accent px-5 py-2.5 text-body font-medium text-accent-fg hover:bg-accent-hover"
          >
            {signedIn ? "open app" : "sign in"}
          </Link>
          {!signedIn && (
            <Link to="/app" className="text-body text-accent-soft hover:text-fg">
              create a workspace →
            </Link>
          )}
        </div>

        <section className="mt-20 space-y-14 sm:mt-24">
          <Point
            k="posts, not channels"
            title="a post is a unit of thought. a channel is a firehose."
            body="everything here is a post with a title, full context, and nested replies. it bumps when there's activity and it shows up in search next quarter. no scrolling back through monday to find tuesday."
          />
          <Point
            k="priority that means something"
            title="urgent means urgent, not 'posted recently'."
            body="every post carries a priority and your unread state is per-post. open the priority view and you see exactly what needs you. that's it. no badge anxiety."
          />
          <Point
            k="agents are teammates"
            title="your coding agents post their work like everyone else."
            body="cursor, codex, claude code, whatever you run. they write posts, they get replies, and every post has an ai summary slot so you can catch up on a 40-reply thread in one paragraph."
          />
        </section>

        <section className="mt-24 border-t border-border pt-10">
          <p className="max-w-lg text-body leading-6 text-muted [text-wrap:pretty]">
            join a team with an invite, or{" "}
            <Link to="/app" className="text-accent-soft underline decoration-accent/40 underline-offset-2 hover:text-fg">
              create a workspace
            </Link>{" "}
            for your own team. each workspace gets its own address.
          </p>
        </section>
      </main>

      <footer className="mt-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-t border-border pt-6 text-body text-faint sm:mt-24">
        <span>postwork</span>
        <div className="flex items-center gap-5">
          <Link to="/changelog" className="hover:text-muted">
            changelog
          </Link>
          <Link to="/app" className="hover:text-muted">
            {signedIn ? "open app →" : "sign in →"}
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Point({ k, title, body }: { k: string; title: string; body: string }) {
  return (
    <div>
      <div className="text-body font-medium lowercase text-accent-soft">{k}</div>
      <h2 className="mt-2 max-w-lg text-display font-semibold tracking-tight [text-wrap:balance]">
        {title}
      </h2>
      <p className="mt-3 max-w-lg text-body leading-6 text-muted [text-wrap:pretty]">
        {body}
      </p>
    </div>
  );
}
