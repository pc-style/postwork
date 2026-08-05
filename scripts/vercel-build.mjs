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
let env = process.env;
if (hasDeployKey) {
  const realVercelEnv = process.env.VERCEL_ENV;
  let frontendCmd = FRONTEND_BUILD;
  if (realVercelEnv !== "production") {
    // The beta branch ships the live site from Vercel's preview environment.
    // The Convex CLI refuses a production deploy key when VERCEL_ENV is not
    // "production", so override it — but only for the `convex deploy`
    // invocation itself (a dedicated env object, only when not already
    // production). The frontend build runs via --cmd with the real label
    // restored so it never sees a false production environment.
    env = { ...process.env, VERCEL_ENV: "production" };
    frontendCmd =
      realVercelEnv === undefined
        ? `env -u VERCEL_ENV bash -c ${JSON.stringify(FRONTEND_BUILD)}`
        : `VERCEL_ENV=${JSON.stringify(realVercelEnv)} ${FRONTEND_BUILD}`;
  }
  command = [
    "bunx",
    "convex",
    "deploy",
    "--cmd-url-env-var-name",
    "VITE_CONVEX_URL",
    "--cmd",
    frontendCmd,
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
