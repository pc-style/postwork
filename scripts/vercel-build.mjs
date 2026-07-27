// Vercel build entry point.
//
// Production builds deploy the Convex backend first (using the project's
// CONVEX_DEPLOY_KEY) so frontend and backend ship together, then validate the
// deploy environment and build the frontend. Preview builds never touch the
// backend: they validate and build against the already-deployed Convex URL.
import { spawnSync } from "node:child_process";

const FRONTEND_BUILD = "bun run validate:deploy-env && bun run build";

// Key-driven: any build that has a CONVEX_DEPLOY_KEY deploys the backend.
// Scope the key in Vercel env settings (e.g. only the environment that serves
// the live domain) to control which builds deploy Convex.
const hasDeployKey = Boolean(process.env.CONVEX_DEPLOY_KEY);

let command;
if (hasDeployKey) {
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
  console.log(
    `vercel-build: no CONVEX_DEPLOY_KEY (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}); ` +
      "frontend-only build (backend not deployed).",
  );
  command = ["bash", "-c", FRONTEND_BUILD];
}

const result = spawnSync(command[0], command.slice(1), { stdio: "inherit" });
process.exit(result.status ?? 1);
