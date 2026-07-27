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
const env = { ...process.env };
if (hasDeployKey) {
  // The beta branch ships the live site from Vercel's preview environment.
  // The Convex CLI refuses a production deploy key when VERCEL_ENV is not
  // "production", so mark the subprocess as production: having the key IS the
  // deliberate deploy signal here.
  env.VERCEL_ENV = "production";
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

const result = spawnSync(command[0], command.slice(1), {
  stdio: "inherit",
  env,
});
process.exit(result.status ?? 1);
