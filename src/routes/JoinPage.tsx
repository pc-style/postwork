import { useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isDemo } from "../lib/demoMode";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function JoinPage() {
  useDocumentTitle("postwork — join");
  const { code } = useParams({ from: "/join/$code" });
  const invite = useQuery(api.access.checkInvite, { code });

  return (
    <div className="theme-ink min-h-screen bg-bg text-fg">
      <div className="mx-auto max-w-3xl px-6 pt-20 pb-24 md:pt-28">
        <header className="flex items-center justify-between">
          <Link to="/" className="text-base font-semibold tracking-tight">
            post<span className="text-accent">work</span>
          </Link>
          <Link
            to="/app"
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg"
          >
            sign in
          </Link>
        </header>

        <main className="mt-20 md:mt-28">
          {invite === undefined ? (
            <JoinShell eyebrow="checking invite">
              <p className="text-sm leading-6 text-muted">loading…</p>
            </JoinShell>
          ) : invite.valid ? (
            <ValidInvite code={code} />
          ) : (
            <JoinShell eyebrow="invite unavailable">
              <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em] lowercase [text-wrap:balance] md:text-5xl">
                this invite is not active anymore.
              </h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-muted [text-wrap:pretty]">
                it may have expired, been revoked, or already been used. you can
                still request access from the landing page.
              </p>
              <Link
                to="/"
                className="mt-10 inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fg transition-[background-color,scale] hover:bg-accent-soft active:scale-[0.96]"
              >
                request access
              </Link>
            </JoinShell>
          )}
        </main>
      </div>
    </div>
  );
}

function ValidInvite({ code }: { code: string }) {
  if (isDemo) return <RedeemInvite code={code} canRedeem />;
  return <ProductInvite code={code} />;
}

function ProductInvite({ code }: { code: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return (
      <JoinShell eyebrow="checking session">
        <p className="text-sm leading-6 text-muted">loading sign-in…</p>
      </JoinShell>
    );
  }
  return <RedeemInvite code={code} canRedeem={!!isSignedIn} />;
}

function RedeemInvite({ code, canRedeem }: { code: string; canRedeem: boolean }) {
  const navigate = useNavigate();
  const redeemInvite = useMutation(api.access.redeemInvite);
  const [state, setState] = useState<"idle" | "redeeming" | "error">("idle");

  const redeem = async () => {
    if (isDemo) {
      await navigate({ to: "/app" });
      return;
    }
    setState("redeeming");
    try {
      await redeemInvite({ code });
      await navigate({ to: "/app" });
    } catch {
      setState("error");
    }
  };

  return (
    <JoinShell eyebrow="invite ready">
      <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-[-0.04em] lowercase [text-wrap:balance] md:text-5xl">
        you were invited to postwork.
      </h1>
      <p className="mt-6 max-w-lg text-base leading-7 text-muted [text-wrap:pretty]">
        a calmer place for team decisions to live as posts, not channels.
      </p>
      <div className="mt-8 inline-flex rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg">
        {code}
      </div>

      {canRedeem ? (
        <div className="mt-10">
          <button
            type="button"
            onClick={() => void redeem()}
            disabled={state === "redeeming"}
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fg transition-[background-color,scale] hover:bg-accent-soft active:scale-[0.96] disabled:opacity-40"
          >
            {state === "redeeming" ? "joining…" : "join postwork"}
          </button>
          {state === "error" && (
            <p className="mt-3 max-w-md text-xs leading-5 text-urgent">
              couldn't redeem that invite. it may have just been used or revoked.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            to="/app"
            className="rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-fg transition-[background-color,scale] hover:bg-accent-soft active:scale-[0.96]"
          >
            sign in to join
          </Link>
          <span className="max-w-xs text-xs leading-5 text-muted">
            after signing in, come back to this link to finish joining.
          </span>
        </div>
      )}
    </JoinShell>
  );
}

function JoinShell({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="text-label font-medium lowercase text-accent-soft">
        {eyebrow}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
