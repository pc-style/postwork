import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ProfileDialog } from "../components/ProfileDialog";
import { clerkAppearance } from "../lib/providers";
import { isDemo } from "../lib/demoMode";
import { useSession } from "../lib/session";

/**
 * Route-level gates. `/` stays public; these wrap /app and /admin.
 * They are client-side convenience only — every Convex function enforces
 * authorization server-side.
 */

export function RequireAuth({ children }: { children: ReactNode }) {
  if (isDemo) return <>{children}</>;
  return <ProductAuthGate>{children}</ProductAuthGate>;
}

function ProductAuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useQuery(api.users.me, isSignedIn ? {} : "skip");

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-sm text-muted">
        loading sign-in…
      </div>
    );
  }

  if (!isSignedIn) return <SignInScreen />;

  if (me === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-sm text-muted">
        loading…
      </div>
    );
  }

  if (me === null || me.user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-sm text-muted">
        setting up…
      </div>
    );
  }

  if (me.status === "pending") return <ActivationScreen />;

  if (me.needsProfileSetup) {
    return <ProfileDialog mode="onboarding" open onClose={() => {}} />;
  }

  return <>{children}</>;
}

function ActivationScreen() {
  const convexClient = useConvex();
  const redeemInvite = useMutation(api.access.redeemInvite);
  const [invite, setInvite] = useState("");
  const [state, setState] = useState<
    "idle" | "checking" | "invalid" | "redeeming" | "error"
  >("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedInvite = window.localStorage.getItem("postwork.inviteCode") ?? "";
    if (storedInvite) setInvite(storedInvite);
  }, []);

  const normalizedInvite = inviteCodeFromInput(invite);

  const activate = async () => {
    if (!normalizedInvite) return;
    setState("checking");
    try {
      const result = await convexClient.query(api.access.checkInvite, {
        code: normalizedInvite,
      });
      if (!result.valid) {
        setState("invalid");
        return;
      }
      setState("redeeming");
      await redeemInvite({ code: normalizedInvite });
      window.localStorage.removeItem("postwork.inviteCode");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center overflow-x-hidden bg-bg px-6 py-10">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-surface p-7 shadow-[0_28px_90px_rgba(0,0,0,0.42)] md:grid md:grid-cols-[0.85fr_1.15fr] md:gap-8 md:p-8">
        <div className="flex flex-col justify-between pb-6 md:pb-0">
          <div>
            <p className="text-label font-medium lowercase text-accent-soft">
              postwork
            </p>
            <h1 className="mt-3 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.04em] lowercase text-fg md:text-4xl">
              activate your invite
            </h1>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              enter the code an admin sent you. after activation, you’ll finish
              your profile before entering the app.
            </p>
          </div>
          <p className="mt-8 hidden max-w-xs border-t border-border pt-4 text-xs leading-5 text-faint md:block">
            <Link to="/" className="text-accent-soft hover:text-fg">
              ← back to the landing page
            </Link>
          </p>
        </div>
        <div className="rounded-lg border border-border bg-surface-2 p-5">
          <div className="mb-1.5 text-label font-medium lowercase text-muted">
            invite code
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={invite}
              onChange={(e) => {
                setInvite(e.target.value);
                setState("idle");
              }}
              placeholder="pw-…"
              className="w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent/50"
            />
            <button
              type="button"
              onClick={() => void activate()}
              disabled={
                state === "checking" ||
                state === "redeeming" ||
                !normalizedInvite
              }
              className="rounded-md border border-border px-3 py-2 text-xs text-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              {state === "checking" || state === "redeeming"
                ? "activating…"
                : "activate"}
            </button>
          </div>
          {state === "invalid" && (
            <p className="mt-2 text-xs text-urgent">
              that code isn't valid anymore.
            </p>
          )}
          {state === "error" && (
            <p className="mt-2 text-xs text-urgent">
              couldn't activate that invite. try again.
            </p>
          )}
          <div className="mt-6 border-t border-border pt-5">
            <AccessOnboarding />
          </div>
        </div>
      </div>
    </div>
  );
}

function SignInScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-x-hidden bg-bg px-6 py-10">
      <div className="w-full max-w-4xl rounded-lg border border-border bg-surface p-7 shadow-[0_28px_90px_rgba(0,0,0,0.42)] md:grid md:grid-cols-[0.85fr_1.15fr] md:gap-8 md:p-8">
        <div className="flex flex-col justify-between pb-6 md:pb-0">
          <div>
            <p className="text-label font-medium lowercase text-accent-soft">
              postwork
            </p>
            <h1 className="mt-3 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.04em] lowercase text-fg md:text-4xl">
              sign in to enter postwork
            </h1>
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              have an invite code or need access? sort it out below, then sign
              in with any provider.
            </p>
            <AccessOnboarding />
          </div>
          <p className="mt-8 hidden max-w-xs border-t border-border pt-4 text-xs leading-5 text-faint md:block">
            <Link to="/" className="text-accent-soft hover:text-fg">
              ← back to the landing page
            </Link>
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <SignIn appearance={clerkAppearance} />
        </div>
      </div>
    </div>
  );
}

/**
 * Invite-code check + request-access form shown next to sign-in. The invite
 * check is a public query; a valid code just means "go ahead and sign in"
 * (redemption binds to the account after auth — see convex/access.ts).
 */
export function AccessOnboarding() {
  const convexClient = useConvex();
  const requestAccess = useMutation(api.access.requestAccess);

  const [invite, setInvite] = useState("");
  const [inviteState, setInviteState] = useState<
    "idle" | "checking" | "valid" | "invalid"
  >("idle");
  const [email, setEmail] = useState("");
  const [requestState, setRequestState] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");

  const normalizedInvite = inviteCodeFromInput(invite);

  const checkInvite = async () => {
    if (!normalizedInvite) return;
    setInviteState("checking");
    try {
      const result = await convexClient.query(api.access.checkInvite, {
        code: normalizedInvite,
      });
      setInviteState(result.valid ? "valid" : "invalid");
    } catch {
      setInviteState("invalid");
    }
  };

  const sendRequest = async () => {
    if (!email.trim()) return;
    setRequestState("sending");
    try {
      await requestAccess({ email });
      setRequestState("sent");
    } catch {
      setRequestState("error");
    }
  };

  return (
    <div className="mt-6 space-y-4 text-sm">
      <div>
        <div className="mb-1.5 text-label font-medium lowercase text-muted">
          invite code
        </div>
        <div className="flex gap-2">
          <input
            value={invite}
            onChange={(e) => {
              setInvite(e.target.value);
              setInviteState("idle");
            }}
            placeholder="pw-…"
            className="w-full max-w-[14rem] rounded-md border border-border bg-bg px-3 py-1.5 font-mono text-xs outline-none focus:border-accent/50"
          />
          <button
            type="button"
            onClick={() => void checkInvite()}
            disabled={inviteState === "checking" || !normalizedInvite}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            {inviteState === "checking" ? "checking…" : "check"}
          </button>
        </div>
        {inviteState === "valid" && (
          <p className="mt-1.5 text-xs text-accent-soft">
            code works. sign in and you're set.
          </p>
        )}
        {inviteState === "invalid" && (
          <p className="mt-1.5 text-xs text-urgent">
            that code isn't valid anymore.
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 text-label font-medium lowercase text-muted">
          no invite? request access
        </div>
        {requestState === "sent" ? (
          <p className="text-xs text-accent-soft">
            request sent. an admin will approve it and you'll get a code.
          </p>
        ) : (
          <div className="flex gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              type="email"
              className="w-full max-w-[14rem] rounded-md border border-border bg-bg px-3 py-1.5 text-xs outline-none focus:border-accent/50"
            />
            <button
              type="button"
              onClick={() => void sendRequest()}
              disabled={requestState === "sending" || !email.trim()}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted transition-colors hover:text-fg disabled:opacity-40"
            >
              {requestState === "sending" ? "sending…" : "request"}
            </button>
          </div>
        )}
        {requestState === "error" && (
          <p className="mt-1.5 text-xs text-urgent">
            couldn't send that. check the email and try again.
          </p>
        )}
      </div>
    </div>
  );
}

function inviteCodeFromInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const joinMatch = trimmed.match(/\/join\/([^/?#]+)/i);
  return decodeURIComponent(joinMatch?.[1] ?? trimmed).trim();
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <AdminGate>{children}</AdminGate>
    </RequireAuth>
  );
}

function AdminGate({ children }: { children: ReactNode }) {
  const { currentUser } = useSession();
  // In product mode the server is the source of truth; in demo mode the
  // switcher's current persona decides (server checks still apply to writes).
  const serverIsAdmin = useQuery(
    api.admin.viewerIsAdmin,
    isDemo ? "skip" : {},
  );

  const isAdmin = isDemo ? currentUser?.role === "admin" : serverIsAdmin;

  if (isAdmin === undefined || (isDemo && !currentUser)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-sm text-muted">
        checking access…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <p className="text-sm text-fg">this area is for admins.</p>
        <p className="text-xs text-muted">
          if you think you should have access, ask an existing admin.
        </p>
        <Link to="/app" className="text-xs text-accent-soft hover:text-fg">
          ← back to the app
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
