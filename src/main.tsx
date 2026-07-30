import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { AppProviders } from "./lib/providers";
import { router } from "./router";
import "./analytics";
import { initializeErrorReporting } from "./monitoring";
import "@fontsource-variable/inter/index.css";
import "./index.css";

initializeErrorReporting();

async function start() {
  if (import.meta.env.DEV) {
    // react-scan highlights unnecessary re-renders. Dev-only dynamic import:
    // it must instrument before the first render but never ships to prod.
    const { scan } = await import("react-scan");
    scan({ enabled: true });
  }

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

void start();
