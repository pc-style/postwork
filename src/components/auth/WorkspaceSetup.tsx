import { useEffect, useRef, useState, type ReactNode } from "react";
import { ConvexError } from "convex/values";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Button } from "../Button";
import { FormField } from "../FormField";
import {
  activateInvite,
  signOutFromActivation,
  type ActivationSignOutState,
  type InviteActivationState,
} from "../../lib/activationSignOut";
import { AuthLoading, AuthShell } from "./AuthShell";

const INVITE_STORAGE_KEY = "postwork.inviteCode";
const REQUEST_STORAGE_KEY = "postwork.accessRequestEmail";

type Choice = "invite" | "request" | "create";

export function inviteCodeFromInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const joinMatch = trimmed.match(/\/join\/([^/?#]+)/i);
  return decodeURIComponent(joinMatch?.[1] ?? trimmed).trim();
}

/**
 * Step 2 of the auth flow: the account exists, now connect it to a workspace.
 * One decision at a time: pick "invite", "request", or (when allowed)
 * "create", then see only that form. An invite code saved from a /join link
 * skips the fork and lands directly on the prefilled invite form.
 */
export function WorkspaceSetup({ needsOrg }: { needsOrg: boolean }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const convexClient = useConvex();
  const redeemInvite = useMutation(api.access.redeemInvite);
  const claimTargetedInvite = useMutation(api.access.claimTargetedInvite);
  const requestAccess = useMutation(api.access.requestAccess);
  const createOrganization = useMutation(api.orgs.create);

  const accountEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  const [choice, setChoice] = useState<Choice | null>(null);
  const [invite, setInvite] = useState("");
  const [inviteState, setInviteState] = useState<InviteActivationState>("idle");

  const [requestEmail, setRequestEmail] = useState("");
  const [requestState, setRequestState] = useState<
    "idle" | "sending" | "error"
  >("idle");
  const [requestError, setRequestError] = useState<string>();
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);

  const [organizationName, setOrganizationName] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [organizationState, setOrganizationState] = useState<
    "idle" | "creating" | "error"
  >("idle");
  const [organizationError, setOrganizationError] = useState<string>();

  const [autoClaim, setAutoClaim] = useState<"checking" | "none">("checking");
  const signOutGuard = useRef(false);
  const signOutCancellationGuard = useRef(false);
  const activationGuard = useRef(false);
  const redemptionLock = useRef<Promise<unknown> | null>(null);
  const [signOutState, setSignOutState] =
    useState<ActivationSignOutState>("idle");

  // Targeted invites (sent to this account's email) activate without any
  // typing at all.
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

  // Restore context saved before sign-in: an invite code from a /join link
  // jumps straight to the prefilled invite form; a previously sent access
  // request shows its waiting state instead of an empty form.
  useEffect(() => {
    const storedInvite = window.localStorage.getItem(INVITE_STORAGE_KEY) ?? "";
    const storedRequest = window.localStorage.getItem(REQUEST_STORAGE_KEY);
    if (storedInvite) {
      setInvite(storedInvite);
      setChoice("invite");
    } else if (storedRequest) {
      setRequestedEmail(storedRequest);
      setChoice("request");
    }
  }, []);

  const normalizedInvite = inviteCodeFromInput(invite);

  const activate = async () => {
    await activateInvite({
      code: normalizedInvite,
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      redemptionLock,
      checkInvite: async (code) => {
        const result = await convexClient.query(api.access.checkInvite, {
          code,
        });
        return result.valid;
      },
      redeemInvite: (code) => redeemInvite({ code }),
      setState: setInviteState,
      onRedeemed: () => window.localStorage.removeItem(INVITE_STORAGE_KEY),
    });
  };

  const sendRequest = async () => {
    const email = requestEmail.trim();
    if (!email || requestState === "sending") return;
    setRequestState("sending");
    setRequestError(undefined);
    try {
      await requestAccess({ email });
      window.localStorage.setItem(REQUEST_STORAGE_KEY, email);
      setRequestedEmail(email);
      setRequestState("idle");
    } catch (error) {
      const data =
        error instanceof ConvexError
          ? (error.data as { message?: string })
          : null;
      setRequestError(
        data?.message ??
          "we couldn't send the request. check the address and try again.",
      );
      setRequestState("error");
    }
  };

  const createOrg = async () => {
    const name = organizationName.trim();
    if (!name || organizationState === "creating") return;
    setOrganizationState("creating");
    setOrganizationError(undefined);
    try {
      await createOrganization({
        name,
        slug: organizationSlug.trim() || undefined,
      });
    } catch (error) {
      setOrganizationState("error");
      const data =
        error instanceof ConvexError
          ? (error.data as { message?: string })
          : null;
      setOrganizationError(
        data?.message ?? "we couldn't create your organization. try again.",
      );
    }
  };

  if (autoClaim === "checking") {
    return <AuthLoading label="Checking account invites" />;
  }
  if (signOutState === "waitingForRedemption") {
    return <AuthLoading label="Finishing activation" />;
  }
  if (signOutState === "signingOut") {
    return <AuthLoading label="Signing out" />;
  }

  return (
    <AuthShell
      title="your account is ready"
      description={
        <>
          you're signed in
          {accountEmail ? (
            <>
              {" "}
              as <span className="text-fg">{accountEmail}</span>
            </>
          ) : null}
          . one more step: connect this account to a workspace.
        </>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-body text-muted">wrong account?</p>
          <Button
            variant="quiet"
            size="sm"
            onClick={() =>
              void signOutFromActivation(
                signOut,
                signOutGuard,
                setSignOutState,
                signOutCancellationGuard,
                redemptionLock,
              )
            }
          >
            sign out
          </Button>
        </div>
      }
    >
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        {signOutState === "error" ? (
          <p role="alert" className="ui-error mb-3">
            couldn't sign out. try again.
          </p>
        ) : null}

        {choice === null ? (
          <div className="grid gap-2">
            <ChoiceButton
              label="i have an invite code"
              detail="a code or link an admin sent you"
              onClick={() => setChoice("invite")}
            />
            <ChoiceButton
              label="i don't have a code yet"
              detail="request access and wait for an admin to approve you"
              onClick={() => setChoice("request")}
            />
            {needsOrg ? (
              <ChoiceButton
                label="start a new workspace"
                detail="create a workspace for your own team"
                onClick={() => setChoice("create")}
              />
            ) : null}
            <p className="mt-2 text-body text-muted">
              already joined on another device? sign out here and sign back in
              with the exact same email or provider you used there. a different
              method creates a separate account.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {choice === "invite" ? (
              <InvitePanel
                invite={invite}
                setInvite={(value) => {
                  setInvite(value);
                  setInviteState("idle");
                }}
                state={inviteState}
                disabled={signOutGuard.current}
                canSubmit={!!normalizedInvite}
                onSubmit={() => void activate()}
              />
            ) : null}
            {choice === "request" ? (
              <RequestPanel
                requestedEmail={requestedEmail}
                email={requestEmail}
                setEmail={(value) => {
                  setRequestEmail(value);
                  setRequestState("idle");
                  setRequestError(undefined);
                }}
                accountEmail={accountEmail}
                prefill={() => setRequestEmail(requestEmail || accountEmail)}
                sending={requestState === "sending"}
                error={requestState === "error" ? requestError : undefined}
                onSubmit={() => void sendRequest()}
                onReset={() => {
                  window.localStorage.removeItem(REQUEST_STORAGE_KEY);
                  setRequestedEmail(null);
                }}
              />
            ) : null}
            {choice === "create" ? (
              <CreatePanel
                name={organizationName}
                setName={(value) => {
                  setOrganizationName(value);
                  if (!slugEdited) {
                    setOrganizationSlug(
                      value
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/^-+|-+$/g, "")
                        .slice(0, 32),
                    );
                  }
                  setOrganizationState("idle");
                  setOrganizationError(undefined);
                }}
                slug={organizationSlug}
                setSlug={(value) => {
                  setOrganizationSlug(value.toLowerCase());
                  setSlugEdited(true);
                  setOrganizationState("idle");
                  setOrganizationError(undefined);
                }}
                creating={organizationState === "creating"}
                error={
                  organizationState === "error" ? organizationError : undefined
                }
                onSubmit={() => void createOrg()}
              />
            ) : null}
            <button
              type="button"
              onClick={() => setChoice(null)}
              className="ui-button inline-flex min-h-11 items-center self-start rounded-md px-1 text-body text-muted transition-colors hover:text-fg"
            >
              <span aria-hidden="true" className="mr-1.5">
                &larr;
              </span>
              other options
            </button>
          </div>
        )}
      </div>
    </AuthShell>
  );
}

function ChoiceButton({
  label,
  detail,
  onClick,
}: {
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ui-button group flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-border bg-bg px-4 py-3 text-left transition-colors hover:border-accent/50 hover:bg-surface-2"
    >
      <span className="min-w-0">
        <span className="block text-body text-fg">{label}</span>
        <span className="mt-0.5 block text-label text-muted">{detail}</span>
      </span>
      <span
        aria-hidden="true"
        className="text-muted transition-colors group-hover:text-fg"
      >
        &rarr;
      </span>
    </button>
  );
}

function InvitePanel({
  invite,
  setInvite,
  state,
  disabled,
  canSubmit,
  onSubmit,
}: {
  invite: string;
  setInvite: (value: string) => void;
  state: InviteActivationState;
  disabled: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FormField
        label="invite code"
        required
        help="paste the code or the whole invite link an admin sent you."
        error={
          state === "invalid"
            ? "this invite code is no longer valid. ask an admin for a new one."
            : state === "error"
              ? "we couldn't activate this invite. check the code and try again."
              : undefined
        }
      >
        <input
          value={invite}
          onChange={(event) => setInvite(event.target.value)}
          placeholder="example: pw-1234"
          className="ui-field font-mono"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={disabled}
        />
      </FormField>
      <Button
        type="submit"
        disabled={!canSubmit || disabled}
        loading={state === "checking" || state === "redeeming"}
        loadingLabel="activating…"
        className="w-full"
      >
        activate invite
      </Button>
    </form>
  );
}

function RequestPanel({
  requestedEmail,
  email,
  setEmail,
  accountEmail,
  prefill,
  sending,
  error,
  onSubmit,
  onReset,
}: {
  requestedEmail: string | null;
  email: string;
  setEmail: (value: string) => void;
  accountEmail: string;
  prefill: () => void;
  sending: boolean;
  error?: string;
  onSubmit: () => void;
  onReset: () => void;
}) {
  if (requestedEmail) {
    return (
      <div className="grid gap-3">
        <StatusNote>
          request sent for <span className="text-fg">{requestedEmail}</span>.
          an admin reviews it and connects your account. once approved, sign
          in here or on any other device with this same account and you'll
          land in the workspace.
        </StatusNote>
        <Button variant="quiet" size="sm" onClick={onReset} className="justify-self-start">
          send a different request
        </Button>
      </div>
    );
  }
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FormField
        label="work email"
        required
        help="an admin sees this address when reviewing your request."
        error={error}
      >
        <input
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@company.com"
          type="email"
          autoComplete="email"
          className="ui-field"
          disabled={sending}
        />
      </FormField>
      {accountEmail && !email ? (
        <button
          type="button"
          onClick={prefill}
          className="ui-button inline-flex min-h-11 items-center self-start rounded-md px-1 text-body text-accent-soft transition-colors hover:text-fg"
        >
          use {accountEmail}
        </button>
      ) : null}
      <Button
        type="submit"
        disabled={!email.trim()}
        loading={sending}
        loadingLabel="sending…"
        className="w-full"
      >
        request access
      </Button>
    </form>
  );
}

function CreatePanel({
  name,
  setName,
  slug,
  setSlug,
  creating,
  error,
  onSubmit,
}: {
  name: string;
  setName: (value: string) => void;
  slug: string;
  setSlug: (value: string) => void;
  creating: boolean;
  error?: string;
  onSubmit: () => void;
}) {
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FormField label="organization name" required error={error}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Acme Inc"
          className="ui-field"
          disabled={creating}
        />
      </FormField>
      <FormField
        label="workspace slug"
        required
        help={
          <>
            <span className="font-mono">{slug || "your-team"}</span>
            .postwork.pcstyle.dev will be your workspace address.
          </>
        }
      >
        <input
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          placeholder="acme"
          className="ui-field font-mono"
          autoCapitalize="none"
          spellCheck={false}
          disabled={creating}
        />
      </FormField>
      <Button
        type="submit"
        disabled={!name.trim() || !slug.trim()}
        loading={creating}
        loadingLabel="creating…"
        className="w-full"
      >
        create workspace
      </Button>
    </form>
  );
}

function StatusNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-body text-muted"
    >
      {children}
    </p>
  );
}
