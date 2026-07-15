# Deployment and observability

Postwork has two deliberately separate Vercel and Convex deployment pairs. The
public demo is anonymous and seedable. The product deployment requires Clerk
and must never receive demo seed data. Never point both frontends at the same
Convex deployment.

Vercel uses the committed build command:

```bash
bun run validate:deploy-env && bun run build
```

Each Vercel project injects its matching backend URL as `VITE_CONVEX_URL`. Both
projects also receive `DEMO_CONVEX_URL` and `PRODUCT_CONVEX_URL`, which are public
endpoint references used only to reject a missing, shared, or swapped target.
Vercel builds only the frontend and must not own `CONVEX_DEPLOY_KEY` or deploy
Convex. Separate demo and product backend release workflows each own only their
matching deploy key, deployment, environment, and migrations.

`beta` is the active base for deployment work and pull requests. Keep `main`
frozen until the demo-to-product phases are complete.

## Vercel environment matrix

Configure each value in the matching Vercel project and environment.

| Variable | Public demo (`postwork.pcstyle.dev`) | Product | Notes |
| --- | --- | --- | --- |
| `VITE_DEMO` | `true` | `false` | Required explicitly so the build and frontend agree about their mode. |
| `DEMO_CONVEX_URL` | Demo Convex deployment URL | Demo Convex deployment URL | Required public endpoint reference. This is not a secret. |
| `PRODUCT_CONVEX_URL` | Product Convex deployment URL | Product Convex deployment URL | Required public endpoint reference. This is not a secret and must differ from `DEMO_CONVEX_URL`. |
| `VITE_CONVEX_URL` | Demo Convex deployment URL | Product Convex deployment URL | Must exactly match the expected URL for `VITE_DEMO`. For local development, `bunx convex dev` writes the selected deployment URL to `.env.local`. |
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

Each Convex deployment owns its server configuration. Do not copy these values
into Vercel unless a separate frontend variable explicitly needs them.

| Variable | Demo Convex deployment | Product Convex deployment |
| --- | --- | --- |
| `DEMO` | `true` | `false` |
| `CLERK_JWT_ISSUER_DOMAIN` | Required so Convex auth config can load | Required to verify Clerk JWTs |
| `AI_PROVIDER` and its provider key/model variables | Optional; baked summaries work without a key | Optional; enables live summaries and agent tasks |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `POSTWORK_APP_URL` | Unset | Required together for outbound product email |

The AI provider pairs are documented in `AGENTS.md`: OpenAI uses
`OPENAI_API_KEY` and optional `OPENAI_MODEL`; Gateway uses
`AI_GATEWAY_API_KEY` and `AI_GATEWAY_MODEL`; OpenRouter uses
`OPENROUTER_API_KEY` plus optional model and base URL values; Pioneer uses
`PIONEER_API_KEY`, `PIONEER_MODEL`, and an optional base URL.

The demo frontend remains anonymous and does not request or send Clerk tokens.
Its Convex deployment still needs `CLERK_JWT_ISSUER_DOMAIN` because
`convex/auth.config.ts` is loaded for every deployment and fails closed when the
issuer is missing.

`CONVEX_DEPLOY_KEY` is a backend release secret, not a Convex runtime variable
or Vercel frontend variable. The demo and product workflows must use different
keys. Product bootstrap commands such as `migrations:ensureProductOrg` and
`migrations:activateFirstProductAdmin` run only through the product workflow.
The demo ownership audit and seed run only through the demo workflow.

## Demo reseed policy

The public demo uses a **manual reseed**, owned by the person deploying or
preparing the demo. Run it before a planned demo, after seed content changes, or
when public data no longer presents a useful walkthrough. Do not reseed on a
fixed schedule: the operation intentionally replaces demo data, and the current
traffic level does not justify surprising active visitors with an automatic
reset. `PCS-227` retains a scheduled job as an optional fallback if manual
ownership proves unreliable.

The seed mutation is destructive and idempotent. It rebuilds demo people,
spaces, posts, replies, priorities, reads, tasks, and baked summaries. Run it
only against the dedicated demo Convex deployment. The product deploy key must
never be present during this procedure.

### Reseed runbook

1. Confirm the current branch contains the intended narrative in
   `convex/seed.ts`, then run `bun run build` locally.
2. In the Convex dashboard, copy the deploy key for the demo deployment and
   confirm the product deploy key is absent from the shell. Run the mode check,
   ownership audit, and seed in one temporary subshell. The silent prompt keeps
   the key out of the command text and shell history. The wrapper forwards
   signals to the active command and waits for it before exiting:

   ```zsh
   (
     unsetopt XTRACE VERBOSE
     set -e
     child_pid=''
     deploy_key=''
     audit_output=''
     reseed_confirmed=''
     audit_file=$(mktemp)
     mode_file=$(mktemp)

     cleanup() {
       unset deploy_key audit_output reseed_confirmed
       rm -f "$audit_file" "$mode_file"
     }
     forward_signal() {
       signal=$1
       status=$2
       if [ -n "$child_pid" ]; then
         kill -"$signal" -- -"$child_pid" 2>/dev/null ||
           kill -"$signal" "$child_pid" 2>/dev/null || true
         wait "$child_pid" 2>/dev/null || true
       fi
       exit "$status"
     }
     run_convex() {
       unsetopt XTRACE VERBOSE
       set -m
       CONVEX_DEPLOY_KEY="$deploy_key" bunx convex "$@" &
       child_pid=$!
       if wait "$child_pid"; then
         command_status=0
       else
         command_status=$?
       fi
       child_pid=''
       set +m
       return "$command_status"
     }

     trap cleanup EXIT
     trap 'forward_signal HUP 129' HUP
     trap 'forward_signal INT 130' INT
     trap 'forward_signal TERM 143' TERM

     read -rs 'deploy_key?Demo deployment deploy key: '
     printf '\n'
     [ -n "$deploy_key" ] || exit 1

     run_convex env get DEMO --prod >"$mode_file"
     [ "$(tr -d '[:space:]' <"$mode_file")" = 'true' ] || {
       printf '%s\n' 'Refusing to seed a deployment without DEMO=true.' >&2
       exit 1
     }

     run_convex run --prod migrations:auditTenantOwnership >"$audit_file"
     audit_output=$(<"$audit_file")
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

     run_convex run --prod seed:run
   )
   ```

   The wrapper disables inherited zsh xtrace and verbose output before reading
   the key, then disables them again before every Convex launch so the expanded
   environment assignment cannot enter trace output. The mode check blocks any
   deployment that does not report `DEMO=true`. The parser exits before
   confirmation unless the audit succeeds, returns valid JSON, and contains
   `ok: true`. Type `yes` only after reviewing the printed audit. On exit, the
   wrapper clears its shell variables and removes its temporary files after the
   active command stops. This does not revoke or rotate the deploy key, so keep
   the key in an approved secret store.
3. Open `https://postwork.pcstyle.dev`, switch between at least two seeded
   teammates, and verify the feed, one post with replies, priorities, and the
   catch-up page. Confirm baked summaries render without an AI provider key.
4. Record the reseed date and commit SHA in the deployment log or release notes.
   If verification fails, fix or revert the seed change and rerun the same
   idempotent command; there is no in-place rollback because demo data is
   disposable by design.

Local development remains `bun run seed`, which targets the deployment selected
by `.env.local` and succeeds only when that deployment has `DEMO=true`. It is not
a substitute for the explicit demo deployment command above.

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

`verify:builds` validates and runs explicit demo and product builds against
distinct fixture deployment URLs. Neither command needs a Sentry DSN; absent
monitoring credentials are an expected, supported local configuration.
