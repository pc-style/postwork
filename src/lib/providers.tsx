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
  layout: {
    // Branding and the "Development mode" banner clash with the product
    // frame; the sign-in/create-account fork lives in our own toggle
    // (see components/auth/SignInScreen), not Clerk's footer link.
    logoPlacement: "none",
    shimmer: false,
    unsafe_disableDevelopmentModeWarnings: true,
  },
  variables: {
    colorBackground: "#121014",
    colorText: "#e8e6e3",
    colorTextSecondary: "#a19d98",
    colorPrimary: "#8c1862",
    colorTextOnPrimaryBackground: "#e8e6e3",
    colorInputBackground: "#0a0a0b",
    colorInputText: "#e8e6e3",
    colorNeutral: "#a19d98",
    colorDanger: "#ff7b7b",
    borderRadius: "6px",
    fontFamily:
      '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full border-0 shadow-none",
    // The card sits inside our own bordered wrapper (see SignInScreen), so it
    // carries no border of its own: one border, even padding on all sides.
    card: "w-full border-0 bg-transparent p-5 shadow-none sm:p-6",
    header: "hidden",
    badge: "bg-surface-2 text-muted shadow-none",
    socialButtonsBlockButton:
      "min-h-11 border-border bg-bg text-fg shadow-none transition-colors hover:bg-surface-2",
    socialButtonsBlockButtonText: "text-fg",
    dividerLine: "bg-border",
    dividerText: "text-muted",
    formFieldLabel: "text-fg",
    formFieldInput:
      "min-h-11 border-border bg-bg text-fg shadow-none placeholder:text-muted focus:border-accent focus:ring-1 focus:ring-accent",
    formButtonPrimary:
      "min-h-11 bg-accent text-fg shadow-none transition-colors hover:bg-accent-hover focus:ring-2 focus:ring-accent-soft",
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
