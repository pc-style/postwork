import type { ReactNode } from "react";
import { ClerkProvider, SignIn, useAuth } from "@clerk/clerk-react";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { convex } from "./convexClient";
import {
  getOptionalViteEnv,
  getRequiredProductViteEnv,
  isDemo,
} from "./demoMode";
import { SessionProvider } from "./session";
import { StoreProvider } from "./store";
import { AgentTasksProvider } from "./agentTasks";
import { ExperimentProvider } from "../flashExperiments/active";
import { ErrorBoundary } from "../components/ErrorBoundary";

const clerkAppearance = {
  variables: {
    colorBackground: "#121014",
    colorText: "#e8e6e3",
    colorTextSecondary: "#8a8782",
    colorPrimary: "#b53a82",
    colorInputBackground: "#0a0a0b",
    colorInputText: "#e8e6e3",
    colorNeutral: "#8a8782",
    borderRadius: "6px",
    fontFamily:
      '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full border border-border bg-surface p-0 shadow-none",
    header: "hidden",
    socialButtonsBlockButton:
      "border-border bg-bg text-fg shadow-none transition-colors hover:bg-surface-2",
    socialButtonsBlockButtonText: "text-fg",
    dividerLine: "bg-border",
    dividerText: "text-muted",
    formFieldLabel: "text-fg",
    formFieldInput:
      "border-border bg-bg text-fg shadow-none placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent",
    formButtonPrimary:
      "bg-accent text-fg shadow-none transition-colors hover:bg-accent-soft focus:ring-2 focus:ring-accent-soft",
    footer: "hidden",
    footerAction: "hidden",
    identityPreviewText: "text-fg",
    identityPreviewEditButton: "text-accent-soft hover:text-fg",
    formResendCodeLink: "text-accent-soft hover:text-fg",
    formFieldAction: "text-accent-soft hover:text-fg",
  },
} as const;

// Ordering dependency: SessionProvider must be the outermost of these, since
// StoreProvider and AgentTasksProvider call useSession() internally.
// AgentTasksProvider also calls useStore(), and the always-mounted
// ExperimentProvider keeps experiment hooks safe even when demo mode disables
// the lab routes.
export function AppProviders({ children }: { children: ReactNode }) {
  if (isDemo) {
    return (
      <ErrorBoundary>
        <ConvexProvider client={convex}>
          <InnerProviders>{children}</InnerProviders>
        </ConvexProvider>
      </ErrorBoundary>
    );
  }

  const publishableKey = getOptionalViteEnv("VITE_CLERK_PUBLISHABLE_KEY");
  if (!publishableKey) {
    getRequiredProductViteEnv("VITE_CLERK_PUBLISHABLE_KEY");
  }

  return (
    <ErrorBoundary>
      <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <ProductModeGate>{children}</ProductModeGate>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </ErrorBoundary>
  );
}

function InnerProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <StoreProvider>
        <AgentTasksProvider>
          <ExperimentProvider>{children}</ExperimentProvider>
        </AgentTasksProvider>
      </StoreProvider>
    </SessionProvider>
  );
}

function ProductModeGate({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-sm text-muted">
        loading sign-in…
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-x-hidden bg-bg px-6 py-10">
        <div className="w-full max-w-4xl rounded-lg border border-border bg-surface p-7 shadow-[0_28px_90px_rgba(0,0,0,0.42)] md:grid md:grid-cols-[0.85fr_1.15fr] md:gap-8 md:p-8">
          <div className="flex flex-col justify-between pb-6 md:pb-0">
            <div>
              <p className="text-label font-medium lowercase text-accent-soft">
                product mode
              </p>
              <h1 className="mt-3 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.04em] lowercase text-fg md:text-4xl">
                sign in to enter postwork
              </h1>
              <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
                this build uses Clerk auth. demo mode keeps the local teammate
                switcher instead.
              </p>
            </div>
            <p className="mt-8 hidden max-w-xs border-t border-border pt-4 text-xs leading-5 text-faint md:block">
              authenticated writes persist to Convex. demo writes stay in a local
              session overlay.
            </p>
          </div>
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <SignIn appearance={clerkAppearance} />
          </div>
        </div>
      </div>
    );
  }

  return <InnerProviders>{children}</InnerProviders>;
}
