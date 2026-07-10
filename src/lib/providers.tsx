import type { ReactNode } from "react";
import { ConvexProviderWithAuth } from "convex/react";
import { convex } from "./convexClient";
import { SessionProvider } from "./session";
import { StoreProvider } from "./store";
import { AgentTasksProvider } from "./agentTasks";
import { SpacesProvider } from "./spaces";
import { ExperimentProvider } from "../flashExperiments/active";
import { useAuth } from "../shoo";

// Ordering dependency: SessionProvider must be the outermost of these,
// since StoreProvider, AgentTasksProvider, and SpacesProvider all call
// useSession() internally. AgentTasksProvider also calls useStore(), so it
// must be nested inside StoreProvider. Reordering these will throw at
// runtime with no compile-time signal.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      <SessionProvider>
        <StoreProvider>
          <AgentTasksProvider>
            <SpacesProvider>
              <ExperimentProvider>{children}</ExperimentProvider>
            </SpacesProvider>
          </AgentTasksProvider>
        </StoreProvider>
      </SessionProvider>
    </ConvexProviderWithAuth>
  );
}
