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

// Ordering dependency: SessionProvider must be the outermost of these, since
// StoreProvider and AgentTasksProvider call useSession() internally.
// AgentTasksProvider also calls useStore(), and the always-mounted
// ExperimentProvider keeps experiment hooks safe even when demo mode disables
// the lab routes.
export function AppProviders({ children }: { children: ReactNode }) {
  if (isDemo) {
    return (
      <ConvexProvider client={convex}>
        <InnerProviders>{children}</InnerProviders>
      </ConvexProvider>
    );
  }

  const publishableKey = getOptionalViteEnv("VITE_CLERK_PUBLISHABLE_KEY");
  if (!publishableKey) {
    getRequiredProductViteEnv("VITE_CLERK_PUBLISHABLE_KEY");
  }

  return (
    <ClerkProvider publishableKey={publishableKey}>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <ProductModeGate>{children}</ProductModeGate>
      </ConvexProviderWithClerk>
    </ClerkProvider>
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
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 py-10">
        <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
          <div className="mb-5">
            <p className="text-label font-medium lowercase text-accent-soft">
              product mode
            </p>
            <h1 className="mt-2 text-xl font-semibold lowercase text-fg">
              sign in to enter postwork
            </h1>
            <p className="mt-2 text-sm text-muted">
              this build uses Clerk auth. demo mode keeps the local teammate
              switcher instead.
            </p>
          </div>
          <SignIn />
        </div>
      </div>
    );
  }

  return <InnerProviders>{children}</InnerProviders>;
}
