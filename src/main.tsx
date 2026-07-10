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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
