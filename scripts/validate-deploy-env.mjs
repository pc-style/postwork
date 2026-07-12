const demo = process.env.VITE_DEMO;

if (demo !== "true" && demo !== "false") {
  throw new Error("VITE_DEMO must be explicitly set to true or false for deployment builds.");
}

if (!process.env.VITE_CONVEX_URL) {
  throw new Error("VITE_CONVEX_URL must point to the shared Convex deployment.");
}

if (demo === "false" && !process.env.VITE_CLERK_PUBLISHABLE_KEY) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required when VITE_DEMO=false.");
}
