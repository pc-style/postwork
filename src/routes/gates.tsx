import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { SignIn, useAuth } from "@clerk/clerk-react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/Button";
import { FormField } from "../components/FormField";
import { ProfileDialog } from "../components/ProfileDialog";
import { Skeleton } from "../components/Skeleton";
import { demoPolicy, isDemo } from "../lib/demoMode";
import { clerkAppearance } from "../lib/providers";

export function RequireAuth({ children }: { children: ReactNode }) {
  if (isDemo) return <>{children}</>;
  return <ProductAuthGate>{children}</ProductAuthGate>;
}

function ProductAuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useQuery(api.users.me, isSignedIn ? {} : "skip");

  if (!isLoaded) return <GateLoading label="Loading sign-in" />;
  if (!isSignedIn) return <SignInScreen />;
  if (me === undefined) return <GateLoading label="Loading account" />;
  if (me === null || me.user === null) return <GateLoading label="Setting up account" />;
  if (me.status === "pending") return <ActivationScreen />;
  if (me.needsProfileSetup) {
    return <ProfileDialog mode="onboarding" open onClose={() => {}} />;
  }
  return <>{children}</>;
}

function GateLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-5">
        <Skeleton label={label} preset="inline" count={3} />
      </div>
    </div>
  );
}

function ActivationScreen() {
  const convexClient = useConvex();
  const redeemInvite = useMutation(api.access.redeemInvite);
  const claimTargetedInvite = useMutation(api.access.claimTargetedInvite);
  const [invite, setInvite] = useState("");
  const [state, setState] = useState<
    "idle" | "checking" | "invalid" | "redeeming" | "error"
  >("idle");
  const [autoClaim, setAutoClaim] = useState<"checking" | "none">("checking");

  useEffect(() => {
    let cancelled = false;
    claimTargetedInvite({})
      .then((result) => {
        if (!cancelled && !result.activated) setAutoClaim("none");
      })
      .catch(() => {
        if (!cancelled) setAutoClaim("none");
      });
    return () => {
      cancelled = true;
    };
  }, [claimTargetedInvite]);

  useEffect(() => {
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

  if (autoClaim === "checking") return <GateLoading label="Checking account invites" />;

  return (
    <AuthFrame
      title="Activate your invite"
      description="Enter the code an admin sent you. You will finish your profile after activation."
    >
      <div className="rounded-lg border border-border bg-surface-2 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <FormField
            label="Invite code"
            required
            error={
              state === "invalid"
                ? "This invite code is no longer valid."
                : state === "error"
                  ? "We couldn't activate this invite. Check the code and try again."
                  : undefined
            }
          >
            <input
              value={invite}
              onChange={(event) => {
                setInvite(event.target.value);
                setState("idle");
              }}
              placeholder="Example: pw-1234"
              className="ui-field font-mono"
            />
          </FormField>
          <Button
            onClick={() => void activate()}
            disabled={!normalizedInvite}
            loading={state === "checking" || state === "redeeming"}
            loadingLabel="activating…"
            className="w-full sm:w-auto"
          >
            activate
          </Button>
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <AccessOnboarding />
        </div>
      </div>
    </AuthFrame>
  );
}

function SignInScreen() {
  return (
    <AuthFrame
      title="Sign in to Postwork"
      description="Use your existing provider. If you need access, check an invite or send a request first."
      sidebar={<AccessOnboarding />}
    >
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <SignIn appearance={clerkAppearance} />
      </div>
    </AuthFrame>
  );
}

function AuthFrame({
  title,
  description,
  sidebar,
  children,
}: {
  title: string;
  description: string;
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-x-hidden bg-bg px-4 py-8 sm:px-6 sm:py-10">
      <div className="grid w-full max-w-4xl gap-6 rounded-lg border border-border bg-surface p-5 sm:p-7 md:grid-cols-[0.85fr_1.15fr] md:gap-8 md:p-8">
        <div className="flex min-w-0 flex-col">
          <p className="text-label font-medium lowercase text-accent-soft">postwork</p>
          <h1 className="mt-3 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.04em] text-fg sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-sm text-sm leading-6 text-muted">{description}</p>
          {sidebar}
          <Link to="/" className="mt-8 inline-flex min-h-11 items-center text-xs text-accent-soft hover:text-fg">
            <span aria-hidden="true" className="mr-1.5">←</span>
            back to the landing page
          </Link>
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

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
    <div className="mt-6 space-y-5 text-sm">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <FormField
          label="Invite code"
          error={inviteState === "invalid" ? "This invite code is no longer valid." : undefined}
          help={inviteState === "valid" ? "This code works. Sign in to activate it." : undefined}
        >
          <input
            value={invite}
            onChange={(event) => {
              setInvite(event.target.value);
              setInviteState("idle");
            }}
            placeholder="Example: pw-1234"
            className="ui-field font-mono"
          />
        </FormField>
        <Button
          variant="secondary"
          onClick={() => void checkInvite()}
          disabled={!normalizedInvite}
          loading={inviteState === "checking"}
          loadingLabel="checking…"
          className="w-full sm:w-auto"
        >
          check
        </Button>
      </div>

      {requestState === "sent" ? (
        <p className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-xs text-accent-soft" role="status">
          Request sent. An admin can approve it and send you an invite.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <FormField
            label="Work email"
            help="Use this to request access without an invite."
            error={requestState === "error" ? "We couldn't send the request. Check the address and try again." : undefined}
          >
            <input
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setRequestState("idle");
              }}
              placeholder="you@company.com"
              type="email"
              className="ui-field"
            />
          </FormField>
          <Button
            variant="secondary"
            onClick={() => void sendRequest()}
            disabled={!email.trim()}
            loading={requestState === "sending"}
            loadingLabel="sending…"
            className="w-full sm:w-auto"
          >
            request access
          </Button>
        </div>
      )}
    </div>
  );
}

function inviteCodeFromInput(value: string) {
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
  const serverIsAdmin = useQuery(
    api.admin.viewerIsAdmin,
    demoPolicy.productAuth ? {} : "skip",
  );
  const isAdmin = demoPolicy.productAuth ? serverIsAdmin : false;

  if (isAdmin === undefined) {
    return <GateLoading label="Checking admin access" />;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <h1 className="text-lg font-semibold text-fg">Admin access required</h1>
        <p className="max-w-sm text-sm text-muted">
          {demoPolicy.productAuth
            ? "Ask an existing admin if you need access to this area."
            : "Admin controls are available in product mode."}
        </p>
        <Link to="/app" className="inline-flex min-h-11 items-center text-sm text-accent-soft hover:text-fg">
          <span aria-hidden="true" className="mr-1.5">←</span>
          back to the app
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
