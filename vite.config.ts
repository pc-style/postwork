import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

const plausibleTrackerPath = fileURLToPath(
  new URL("./node_modules/@plausible-analytics/tracker/plausible.js", import.meta.url),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@plausible-analytics/tracker": plausibleTrackerPath,
    },
  },
  server: { port: 5173 },
});
