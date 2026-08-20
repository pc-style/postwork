import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AuthLoading, AuthShell } from "../components/auth/AuthShell";
import { Button } from "../components/Button";
import { isDemo } from "../lib/demoMode";
import { useDocumentTitle } from "../lib/useDocumentTitle";

const INVITE_STORAGE_KEY = "postwork.inviteCode";

export function JoinPage() {
  useDocumentTitle("postwork - join");
  const { code } = useParams({ from: "/join/$code" });
  const invite = useQuery(api.access.checkInvite, { code });

  if (invite === undefined) return <AuthLoading label="Checking invite" />;

  if (!invite.valid) {
    return (
      <AuthShell
        title="this invite is not active anymore"
        description="it may have expired, been revoked, or already been used. you can still sign in and request access."
      >
        <Link
          to={isDemo ? "/" : "/app"}
          className="ui-button inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-accent bg-accent px-4 text-body font-medium text-accent-fg transition-colors hover:border-accent-hover hover:bg-accent-hover"
        >
          sign in and request access
        </Link>
      </AuthShell>
    );
  }

  return <ValidInvite code={code} />;
}

function ValidInvite({ code }: { code: string }) {
  if (isDemo) return <RedeemInvite code={code} canRedeem />;
  return <ProductInvite code={code} />;
}

function ProductInvite({ code }: { code: string }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <AuthLoading label="Loading sign-in" />;
  return <RedeemInvite code={code} canRedeem={!!isSignedIn} />;
}

function RedeemInvite({
  code,
  canRedeem,
}: {
  code: string;
  canRedeem: boolean;
}) {
  const navigate = useNavigate();
  const redeemInvite = useMutation(api.access.redeemInvite);
  const [state, setState] = useState<"idle" | "redeeming" | "error">("idle");

  // Save the code before sign-in so the workspace step can prefill it after
  // the user authenticates, even if they never return to this link.
  useEffect(() => {
    if (canRedeem || isDemo) return;
    window.localStorage.setItem(INVITE_STORAGE_KEY, code);
  }, [canRedeem, code]);

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
    <AuthShell
      title="you were invited to postwork"
      description="a calmer place for team decisions to live as posts, not channels."
    >
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <p className="text-body font-medium lowercase text-muted">
          your invite code
        </p>
        <p className="mt-2 inline-flex rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-code text-fg">
          {code}
        </p>

        {canRedeem ? (
          <div className="mt-5 grid gap-3">
            <Button
              onClick={() => void redeem()}
              loading={state === "redeeming"}
              loadingLabel="joining…"
              className="w-full"
            >
              join postwork
            </Button>
            {state === "error" ? (
              <p role="alert" className="ui-error">
                couldn't redeem this invite. try again; if it still fails, ask
                for a new invite.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            <Link
              to="/app"
              className="ui-button inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-accent bg-accent px-4 text-body font-medium text-accent-fg transition-colors hover:border-accent-hover hover:bg-accent-hover"
            >
              sign in to accept
            </Link>
            <p className="text-body text-muted">
              we saved your code. sign in or create an account and the code
              will be filled in for you on the next step.
            </p>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
