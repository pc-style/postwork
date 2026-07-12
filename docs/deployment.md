# Deployment and observability

Postwork has two deliberately separate Vercel + Convex deployments. The public
demo is seeded and anonymous; the product deployment is authenticated. Never
point both frontend environments at the same Convex deployment.

Vercel uses the committed build command:

```bash
bunx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'bun run build'
```

It deploys the Convex project selected by `CONVEX_DEPLOY_KEY`, then injects that
deployment's URL into the Vite build as `VITE_CONVEX_URL`.

## Vercel environment matrix

Configure each value in the matching Vercel project/environment. Do not share a
`CONVEX_DEPLOY_KEY` across the demo and product deployments.

| Variable | Public demo (`postwork.pcstyle.dev`) | Product | Notes |
| --- | --- | --- | --- |
| `VITE_DEMO` | `true` | `false` | Required explicitly so the build and frontend agree about their mode. |
| `VITE_CONVEX_URL` | Injected by the build command from the demo Convex deployment | Injected by the build command from the product Convex deployment | Do not manually pin it in Vercel when using the committed build command. For local builds, `bunx convex dev` writes it to `.env.local`. |
| `CONVEX_DEPLOY_KEY` | Demo deployment key | Product deployment key | Server-side Vercel secret; never prefix with `VITE_`. |
| `VITE_PLAUSIBLE_DOMAIN` | `postwork.pcstyle.dev` | **unset** | The client also checks demo mode and the actual hostname before initializing Plausible. Product analytics policy is intentionally unset. |
| `VITE_SENTRY_DSN` | Optional public Sentry DSN for the demo project | Optional public Sentry DSN for the product project | Leaving it unset disables Sentry fully; no monitoring client is initialized or contacted. A browser DSN is safe to expose, but must be project-scoped. |
| `VITE_SENTRY_ENVIRONMENT` | Recommended: `demo` | Recommended: `production` | Optional explicit Sentry environment label. Without it, demo defaults to `demo` and product uses Vite's build mode. |
| `VITE_SENTRY_RELEASE` | Optional immutable release identifier | Optional immutable release identifier | Set this when a release identifier is available (for example, the commit SHA supplied by your deployment process). |

The browser Sentry client tags all reports with `postwork.mode` (`demo` or
`product`), Sentry environment, and release when configured. Its default browser
global-handler integration captures uncaught errors and unhandled promise
rejections. The existing React `ErrorBoundary` keeps its current fallback UI and
also captures its exceptions with the component stack.

No server-side Sentry integration is configured: Convex structured logging in
`convex/lib/observability.ts` remains the backend source of truth, and this keeps
the local anonymous Convex workflow credential-free.

## Demo reseed policy

The public demo uses a **manual reseed**, owned by the person deploying or
preparing the demo. Run it before a planned demo, after seed content changes, or
when public data no longer presents a useful walkthrough. Do not reseed on a
fixed schedule: the operation intentionally replaces demo data, and the current
traffic level does not justify surprising active visitors with an automatic
reset. `PCS-227` retains a scheduled job as an optional fallback if manual
ownership proves unreliable.

The seed mutation is destructive and idempotent. It wipes application tables
before rebuilding the demo organization, people, spaces, posts, replies,
priorities, reads, tasks, and baked summaries. It must run only against the
dedicated demo Convex deployment, never product.

### Reseed runbook

1. Confirm the current branch contains the intended narrative in
   `convex/seed.ts`, then run `bun run build` locally.
2. In the Convex dashboard, copy the deploy key for the **demo** deployment and
   verify that its `DEMO` environment variable is `true`. Do not continue if the
   deployment identity or mode is ambiguous.
3. Export the demo deploy key only for this shell and run the seed:

   ```bash
   CONVEX_DEPLOY_KEY='<demo deploy key>' bunx convex run --prod seed:run
   ```

4. Open `https://postwork.pcstyle.dev`, switch between at least two seeded
   teammates, and verify the feed, one post with replies, priorities, and the
   catch-up page. Confirm baked summaries render without an AI provider key.
5. Record the reseed date and commit SHA in the deployment log or release notes.
   If verification fails, fix or revert the seed change and rerun the same
   idempotent command; there is no in-place rollback because demo data is
   disposable by design.

Local development remains `bun run seed`, which targets the deployment selected
by `.env.local`. It is not a substitute for the explicit demo-production command
above.

## Summary refresh policy

Post summaries remain manually generated or regenerated. A reply marks an
existing summary stale, the UI explains that newer replies are missing, and the
Generate/Regenerate action is already authenticated and rate-limited. Postwork
will not add a Convex cron for automatic refresh yet: scheduled model calls
would spend provider capacity without user intent, refresh threads nobody is
reading, and make provider failures an operational background concern.

Reconsider automatic refresh only when production usage shows stale summaries
regularly blocking catch-up. At that point, prefer an opt-in per-organization
setting with a bounded queue, idempotency, retry limits, and provider-budget
controls rather than a global cron.

## Local verification

```bash
bun install
bun run test:observability
bun run verify:builds
```

`verify:builds` runs the default demo build and an explicit
`VITE_DEMO=false` product build. Neither command needs a Sentry DSN; absent
monitoring credentials are an expected, supported local configuration.

## Shared Convex deployment tenancy

Both frontends use one Convex deployment and one schema. Anonymous demo traffic is fixed to the `postwork-demo` organization; Clerk-authenticated product traffic is fixed to `postwork` (`Postwork`). Backend authorization derives this scope from Convex auth and never from `DEMO` or a caller-provided organization.

Bootstrap in order: deploy backend from the single designated backend release workflow, run `migrations:ensureProductOrg`, run `migrations:auditTenantOwnership`, then run `migrations:activateFirstProductAdmin` with the intended product user ID. Vercel builds only the frontend; it must not deploy Convex.

Set the demo frontend to `VITE_CONVEX_URL=<shared deployment URL>` with demo UI mode enabled. Set the product frontend to the same `VITE_CONVEX_URL`, plus its Clerk publishable key and product UI mode. Convex owns Clerk issuer/auth configuration and provider secrets. Only the backend release workflow owns `CONVEX_DEPLOY_KEY`.
