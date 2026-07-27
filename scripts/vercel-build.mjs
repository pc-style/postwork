// Vercel build entry point.
//
// Production builds deploy the Convex backend first (using the project's
// CONVEX_DEPLOY_KEY) so frontend and backend ship together, then validate the
// deploy environment and build the frontend. Preview builds never touch the
// backend: they validate and build against the already-deployed Convex URL.
import { spawnSync } from "node:child_process";

const FRONTEND_BUILD = "bun run validate:deploy-env && bun run build";

const isProduction = process.env.VERCEL_ENV === "production";
const hasDeployKey = Boolean(process.env.CONVEX_DEPLOY_KEY);

let command;
if (isProduction && hasDeployKey) {
  command = [
    "bunx",
    "convex",
    "deploy",
    "--cmd-url-env-var-name",
    "VITE_CONVEX_URL",
    "--cmd",
    FRONTEND_BUILD,
  ];
} else {
  if (isProduction && !hasDeployKey) {
    console.warn(
      "vercel-build: VERCEL_ENV=production but CONVEX_DEPLOY_KEY is unset; " +
        "building the frontend only (backend NOT deployed).",
    );
  } else {
    console.log(
      `vercel-build: VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}; ` +
        "frontend-only build (backend not deployed).",
    );
  }
  command = ["bash", "-c", FRONTEND_BUILD];
}

const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
process.exit(result.status ?? 1);
