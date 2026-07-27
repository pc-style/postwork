import type { ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexProvider } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { convex } from "./convexClient";
import {
  demoPolicy,
  getOptionalViteEnv,
  getRequiredProductViteEnv,
} from "./demoMode";
import { SessionProvider } from "./session";
import { StoreProvider } from "./store";
import { AgentTasksProvider } from "./agentTasks";
import { ExperimentProvider } from "../flashExperiments/active";
import { ErrorBoundary } from "../components/ErrorBoundary";

export const clerkAppearance = {
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
  if (!demoPolicy.productAuth) {
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

  // No global sign-in gate here: `/` is a public landing page. Auth gating
  // happens at the route level (see RequireAuth / RequireAdmin in the router).
  return (
    <ErrorBoundary>
      <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <InnerProviders>{children}</InnerProviders>
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
