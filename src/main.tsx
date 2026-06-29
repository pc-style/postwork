import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProviderWithAuth } from "convex/react";
import { RouterProvider } from "@tanstack/react-router";
import { convex } from "./lib/convexClient";
import { SessionProvider } from "./lib/session";
import { StoreProvider } from "./lib/store";
import { AgentTasksProvider } from "./lib/agentTasks";
import { SpacesProvider } from "./lib/spaces";
import { router } from "./router";
import { ExperimentProvider } from "./flashExperiments/active";
import { useAuth } from "./shoo";
import "@fontsource-variable/inter/index.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProviderWithAuth client={convex} useAuth={useAuth}>
      <SessionProvider>
        <StoreProvider>
          <AgentTasksProvider>
            <SpacesProvider>
              <ExperimentProvider>
                <RouterProvider router={router} />
              </ExperimentProvider>
            </SpacesProvider>
          </AgentTasksProvider>
        </StoreProvider>
      </SessionProvider>
    </ConvexProviderWithAuth>
  </StrictMode>,
);
