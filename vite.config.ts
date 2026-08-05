import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    rolldownOptions: {
      output: {
        // Split stable vendor code out of the app chunk. These groups change
        // only on dependency upgrades, so returning users keep them cached
        // across app deploys; they also download in parallel on first visit.
        advancedChunks: {
          groups: [
            { name: "react", test: /node_modules\/(react|react-dom|scheduler)\// },
            { name: "sentry", test: /node_modules\/@sentry(-internal)?\// },
            { name: "clerk", test: /node_modules\/@clerk\// },
            { name: "convex", test: /node_modules\/convex\// },
          ],
        },
      },
    },
  },
});
