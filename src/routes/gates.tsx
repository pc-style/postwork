import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@clerk/clerk-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { AuthLoading, AuthShell } from "../components/auth/AuthShell";
import { SignInScreen } from "../components/auth/SignInScreen";
import { WorkspaceSetup } from "../components/auth/WorkspaceSetup";
import { ProfileDialog } from "../components/ProfileDialog";
import { demoPolicy, isDemo } from "../lib/demoMode";
import { requestedTenantSlug, workspaceUrl } from "../lib/tenant";

export function RequireAuth({ children }: { children: ReactNode }) {
  if (isDemo) return <>{children}</>;
  return <ProductAuthGate>{children}</ProductAuthGate>;
}

// The auth flow is linear, one decision per screen:
// 1. SignInScreen: sign in or create an account (Clerk).
// 2. WorkspaceSetup: connect the account to a workspace (invite code,
//    access request, or creating a new workspace).
// 3. ProfileDialog: finish the profile.
function ProductAuthGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const me = useQuery(api.users.me, isSignedIn ? {} : "skip");

  if (!isLoaded) return <AuthLoading label="Loading sign-in" />;
  if (!isSignedIn) return <SignInScreen />;
  if (me === undefined) return <AuthLoading label="Loading account" />;
  if (me === null || me.user === null) {
    return <AuthLoading label="Setting up account" />;
  }
  if (me.status === "pending") return <WorkspaceSetup needsOrg={me.needsOrg} />;
  if (me.needsProfileSetup) {
    return <ProfileDialog mode="onboarding" open onClose={() => {}} />;
  }
  if (
    requestedTenantSlug &&
    me.org?.slug &&
    requestedTenantSlug !== me.org.slug
  ) {
    return (
      <TenantFollowGate
        slug={requestedTenantSlug}
        activeOrg={{ name: me.org.name, slug: me.org.slug }}
      />
    );
  }
  return <>{children}</>;
}

/**
 * The URL is the workspace. When a signed-in member opens a tenant subdomain
 * that is not their active workspace, follow the URL: switch the session to
 * that org (membership-checked server-side). Old slugs redirect to the
 * canonical address; non-members keep the "another address" screen.
 */
function TenantFollowGate({
  slug,
  activeOrg,
}: {
  slug: string;
  activeOrg: { name: string; slug: string };
}) {
  const context = useQuery(api.orgs.getContext, { slug });
  const switchActive = useMutation(api.orgs.switchActive);
  const attempted = useRef(false);
  const [failed, setFailed] = useState(false);

  const canonicalSlug = context?.org.slug;
  useEffect(() => {
    if (!context || failed) return;
    // An old alias resolves to the canonical address — move the browser
    // there so bookmarks heal themselves.
    if (canonicalSlug && canonicalSlug !== slug) {
      window.location.replace(
        `${workspaceUrl(canonicalSlug)}${window.location.pathname}${window.location.search}`,
      );
      return;
    }
    if (attempted.current) return;
    attempted.current = true;
    switchActive({ orgId: context.org._id }).catch(() => setFailed(true));
  }, [canonicalSlug, context, failed, slug, switchActive]);

  if (context === undefined) {
    return <AuthLoading label="Checking workspace" />;
  }
  if (context !== null && !failed) {
    // Membership confirmed — the switch (or alias redirect) is in flight;
    // the parent gate re-renders children once `me.org.slug` matches.
    return <AuthLoading label={`Opening ${context.org.name}`} />;
  }

  const canonicalUrl = `${workspaceUrl(activeOrg.slug)}${window.location.pathname}${window.location.search}`;
  return (
    <AuthShell
      title="this workspace has another address"
      description={`you're signed in to ${activeOrg.name}, and your account doesn't belong to the workspace at this address.`}
    >
      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <p className="text-body text-muted">
          continue to your workspace at{" "}
          <span className="font-mono text-code text-fg">
            {activeOrg.slug}.postwork.pcstyle.dev
          </span>
          .
        </p>
        <a
          href={canonicalUrl}
          className="ui-button mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-accent bg-accent px-4 text-body font-medium text-accent-fg transition-colors hover:border-accent-hover hover:bg-accent-hover"
        >
          open {activeOrg.name}
        </a>
      </div>
    </AuthShell>
  );
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
    return <AuthLoading label="Checking admin access" />;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center">
        <h1 className="text-title font-semibold lowercase text-fg">
          admin access required
        </h1>
        <p className="max-w-sm text-body text-muted">
          {demoPolicy.productAuth
            ? "Ask an existing admin if you need access to this area."
            : "Admin controls are available in product mode."}
        </p>
        <Link
          to="/app"
          className="inline-flex min-h-11 items-center text-body text-accent-soft hover:text-fg"
        >
          <span aria-hidden="true" className="mr-1.5">
            &larr;
          </span>
          back to the app
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
