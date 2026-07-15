# Deployment and observability

Postwork has two Vercel frontends backed by one tenant-isolated Convex
deployment. The public demo is anonymous and fixed to the seeded
`postwork-demo` organization. The product frontend requires Clerk and is fixed
to the `postwork` organization. Backend authorization derives that scope from
authentication, never from `VITE_DEMO` or a caller-provided organization.

Vercel uses the committed build command:

```bash
bun run validate:deploy-env && bun run build
```

Each Vercel project injects the shared backend URL as `VITE_CONVEX_URL`. Vercel
builds only the frontend and must not own `CONVEX_DEPLOY_KEY` or deploy Convex.
One separate backend release workflow owns Convex deployment and migrations.

`beta` is the active base for deployment work and pull requests. Keep `main`
frozen until the demo-to-product phases are complete.

## Vercel environment matrix

Configure each value in the matching Vercel project and environment.

| Variable | Public demo (`postwork.pcstyle.dev`) | Product | Notes |
| --- | --- | --- | --- |
| `VITE_DEMO` | `true` | `false` | Required explicitly so the build and frontend agree about their mode. |
| `VITE_CONVEX_URL` | Shared Convex deployment URL | Same shared Convex deployment URL | Required by `validate:deploy-env`. For local development, `bunx convex dev` writes it to `.env.local`. |
| `VITE_CLERK_PUBLISHABLE_KEY` | **unset** | Clerk publishable key | Required by `validate:deploy-env` when `VITE_DEMO=false`. This is a browser-visible key. |
| `VITE_PLAUSIBLE_DOMAIN` | `postwork.pcstyle.dev` | **unset** | The client also checks demo mode and the actual hostname before initializing Plausible. Product analytics policy is intentionally unset. |
| `VITE_GIPHY_API_KEY` | Optional browser key | Optional browser key | Enables GIF search. Keep it restricted to the intended origins. |
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

## Convex deployment contract

The shared Convex deployment owns server configuration. Do not copy these
values into Vercel unless a separate frontend variable explicitly needs them.

| Variable | Requirement | Purpose |
| --- | --- | --- |
| `CLERK_JWT_ISSUER_DOMAIN` | Required | Configures Convex to verify Clerk JWTs for product traffic. |
| `DEMO` | Set to `false` when outbound product email is enabled | Gates Resend delivery only. It does not select the demo or product tenant. |
| `AI_PROVIDER` and its provider key/model variables | Optional | Enables live summaries and agent tasks. Seeded demo summaries use `seed/baked` without a provider key. |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `POSTWORK_APP_URL` | Required together for outbound product email | Configures the product notification transport. |

The AI provider pairs are documented in `AGENTS.md`: OpenAI uses
`OPENAI_API_KEY` and optional `OPENAI_MODEL`; Gateway uses
`AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL`; OpenRouter uses
`OPENROUTER_API_KEY` plus optional model and base URL values; Pioneer uses
`PIONEER_API_KEY`, `PIONEER_MODEL`, and an optional base URL.

`CONVEX_DEPLOY_KEY` is a secret for the single backend release workflow, not a
Convex runtime variable and not a Vercel frontend variable. After deploying a
new backend, run `migrations:ensureProductOrg`,
`migrations:auditTenantOwnership`, then `migrations:activateFirstProductAdmin`
with the intended product user ID when initial product bootstrap is needed.
Scope every command in that sequence to the designated shared deployment with
the same backend deploy key.

## Demo reseed policy

The public demo uses a **manual reseed**, owned by the person deploying or
preparing the demo. Run it before a planned demo, after seed content changes, or
when public data no longer presents a useful walkthrough. Do not reseed on a
fixed schedule: the operation intentionally replaces demo data, and the current
traffic level does not justify surprising active visitors with an automatic
reset. `PCS-227` retains a scheduled job as an optional fallback if manual
ownership proves unreliable.

The seed mutation is destructive and idempotent within the demo tenant. It
preserves the demo organization ID and every product-owned row, then rebuilds
the demo people, spaces, posts, replies, priorities, reads, tasks, and baked
summaries. Run it only against the designated shared deployment after verifying
the target, because that deployment also serves product traffic.

### Reseed runbook

1. Confirm the current branch contains the intended narrative in
   `convex/seed.ts`, then run `bun run build` locally.
2. Confirm the target is the designated shared Convex deployment. Run the audit
   and seed in one temporary subshell so both commands use the same production
   deploy key. The silent prompt keeps the value out of the command text and
   shell history:

   ```bash
   (
     set -e
     deploy_key=
     audit_output=
     reseed_confirmed=
     trap 'unset deploy_key audit_output reseed_confirmed' EXIT

     read -rs 'deploy_key?Production backend deploy key: '
     printf '\n'
     [ -n "$deploy_key" ] || exit 1

     audit_output=$(CONVEX_DEPLOY_KEY="$deploy_key" bunx convex run --prod migrations:auditTenantOwnership)
     printf '%s\n' "$audit_output"
     printf '%s\n' "$audit_output" | bun -e '
       const output = await Bun.stdin.text();
       let audit;
       try {
         audit = JSON.parse(output);
       } catch {
         console.error("Tenant ownership audit returned malformed output.");
         process.exit(1);
       }
       if (audit?.ok !== true) {
         console.error("Tenant ownership audit did not return ok: true.");
         process.exit(1);
       }
     '

     printf 'Machine audit passed. Type yes to confirm the demo reseed: '
     read -r reseed_confirmed
     [ "$reseed_confirmed" = 'yes' ] || exit 1

     CONVEX_DEPLOY_KEY="$deploy_key" bunx convex run --prod seed:run
   )
   ```

   The parser exits before confirmation unless the audit command succeeds, its
   output is valid JSON, and the parsed result contains `ok: true`. Type `yes`
   only after separately reviewing the printed audit output and confirming the
   demo reseed. The exit trap clears the wrapper shell's copies on completion or
   failure. A running child process has its own inherited copy, so if only the
   wrapper PID is externally signaled, confirm that no `bunx` or Convex child
   remains before leaving the terminal.
3. Open `https://postwork.pcstyle.dev`, switch between at least two seeded
   teammates, and verify the feed, one post with replies, priorities, and the
   catch-up page. Confirm baked summaries render without an AI provider key.
4. Record the reseed date and commit SHA in the deployment log or release notes.
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
