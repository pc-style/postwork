# Postwork

Postwork is an experimental, post-based team communication prototype. Posts—not
channels—are the top-level unit: each is a durable thread with nested replies,
activity bumping, search, unread and priority state, plus an AI catch-up slot.

It intentionally supports two modes from one codebase:

- **Public demo mode** is a seeded, no-auth product walkthrough. Visitor writes
  stay in the browser session and disappear on refresh.
- **Product mode** is the authenticated Convex app: Clerk sign-in,
  invite activation, profile onboarding, organization-scoped reads/writes,
  moderation, admin controls, image uploads, and durable agent tasks.

This remains a flow-design prototype, not a production-ready service. Treat the
public demo as fictional seed data only.

## What exists today

- Posts, nested replies, activity-bumped feeds, full-text search, per-user
  unread state, priority, spaces, and profile walls.
- Product-mode Clerk authentication, invite-gated activation, profile setup,
  role-aware admin access, org-scoped access checks, rate limits, input
  validation, cursor pagination, image attachments, and moderation actions.
- AI post summaries through OpenAI, Vercel AI Gateway, OpenRouter, or Pioneer.
  Admins can choose OpenRouter model IDs per summary or agent-task path.
- Persisted `agentTasks` with first-class agent users. The current runner is an
  internal simulated AI workflow that writes its result back as an agent reply;
  it is not yet an external coding-agent or inbound-integration connector.

For the live roadmap and issue tracker, see the
[Postwork project on Linear](https://linear.app/pcstyle-cc/project/postwork-e17b8653df70).
Pull it locally with `bun run linear:pull` (requires `LINEAR_API_KEY` in `.env`).
Historical planning docs are in [`docs/archive/`](docs/archive/).

## Stack

- **Bun** for all tooling
- **Vite + React 19 + TypeScript**
- **TanStack Router**
- **Convex** for realtime data and serverless functions
- **Clerk** for product-mode authentication
- **AI SDK v7** for summaries and agent tasks

## Run locally

The repository is configured for a local anonymous Convex deployment. Start the
public demo experience with:

```bash
bun install
bun run dev
```

Open http://localhost:5173. Demo mode is the default when `VITE_DEMO` is unset;
the UserSwitcher at the bottom of the sidebar changes seeded personas.

If the local database is empty, reseed it:

```bash
bun run seed
```

To exercise the product build, provide the required product environment values
(including Clerk) and build with demo mode off:

```bash
VITE_DEMO=false bun run build
```

Useful checks:

```bash
bun run build
bun run test
bun run verify:builds
bun run test:observability
bun run typecheck
bun run codegen
```

`bun run codegen` needs a configured Convex deployment. Use `bunx convex dev
--configure` to point the local checkout at Convex Cloud; do not run two
`convex dev` processes against the same anonymous local deployment.

## AI configuration

Seed posts include baked summaries, so the demo remains useful without an API
key. In a Convex deployment, configure one provider for live summary generation
and simulated agent-task execution.

**OpenRouter (default):**

```bash
bunx convex env set AI_PROVIDER openrouter
# Paste the key only when Convex prompts, so it never enters shell history.
pbpaste | bunx convex env set OPENROUTER_API_KEY
# optional; defaults to openrouter/free
bunx convex env set OPENROUTER_MODEL openrouter/free
```

**Vercel AI Gateway:**

```bash
bunx convex env set AI_PROVIDER gateway
bunx convex env set AI_GATEWAY_API_KEY <your-key>
bunx convex env set AI_GATEWAY_MODEL openai/gpt-5.4-mini
```

**OpenAI:**

```bash
bunx convex env set AI_PROVIDER openai
bunx convex env set OPENAI_API_KEY sk-...
# optional; defaults to gpt-5.4-mini
bunx convex env set OPENAI_MODEL gpt-5.4-mini
```

**Pioneer:**

```bash
bunx convex env set AI_PROVIDER pioneer
bunx convex env set PIONEER_API_KEY <your-key>
bunx convex env set PIONEER_MODEL <your-model-id>
```

The `/admin/models` control plane can override the OpenRouter model ID for a
generation path. API keys always stay in Convex environment variables.

## Deploy

The Vite frontend deploys to Vercel and the backend deploys to Convex Cloud.
The public demo and authenticated product use separate Vercel projects and
separate Convex deployments. Each frontend receives the `VITE_CONVEX_URL` for
its own backend, and each backend release workflow owns only its matching
`CONVEX_DEPLOY_KEY`.

```bash
bunx convex dev --configure
# deploy each Convex backend from its matching release workflow
# configure both Vercel projects with DEMO_CONVEX_URL and PRODUCT_CONVEX_URL
# set each project's VITE_CONVEX_URL to its matching endpoint and mode
# build command: bun run validate:deploy-env && bun run build
```

Set `VITE_DEMO=true` for the public demo. Set `VITE_DEMO=false` and
`VITE_CLERK_PUBLISHABLE_KEY` for product. Set `DEMO=true` on the demo Convex
deployment and `DEMO=false` on product. Product also requires
`CLERK_JWT_ISSUER_DOMAIN`; the demo Convex deployment requires the same issuer
so its auth config can load, but the demo frontend remains anonymous. Product
owns its notification configuration. Seed and reseed operations are destructive
and fail unless the target deployment has `DEMO=true`.
`DEMO_CONVEX_URL` and `PRODUCT_CONVEX_URL` are public endpoint references, not
secrets, and both must be configured in both Vercel projects so the build rejects
a missing, shared, or swapped Convex target.

Follow the guarded runbook in [`docs/deployment.md`](docs/deployment.md).

See [`docs/deployment.md`](docs/deployment.md) for the complete Vercel demo and
product environment matrix, including optional Sentry error reporting and the
demo-only Plausible policy.

## Project layout

```text
convex/
  schema.ts            org-scoped data model, invites, admin audit, AI settings
  authUsers.ts         Clerk identity, activation, and access helpers
  posts.ts             feed, search, counts, and post mutations
  replies.ts           nested replies and server-side agent replies
  spaces.ts            spaces, memberships, and space feeds
  agentTasks.ts        persisted task lifecycle and internal AI runner
  ai.ts                summary action and provider/model resolution
  admin.ts             users, invites, access requests, audit, model settings
  access.ts            public invite validation and activation
  attachments.ts       product-mode Convex storage attachments
  seed.ts              demo org, people, narrative posts, and baked summaries
src/
  router.tsx           public, app, admin, and legacy redirect routes
  routes/              landing, app, spaces, agents, join, admin, redesign shells
  components/          posts, replies, profiles, moderation, dialogs, app chrome
  lib/                 demo/product mode, sessions, writes, attachments, providers
docs/
  product.md           product register, users, brand personality
  design.md            visual system (canonical design reference)
  archive/             historical planning docs (roadmap now on Linear)
scripts/
  linear-setup-postwork.mjs  one-shot Linear bootstrap (creates issues)
  linear-pull.mjs            pull live Linear state as markdown or JSON
```

## Product direction

The current priority is a trustworthy catch-up loop: make summaries visibly
stale after replies, build per-user catch-up, then add priority-aware outbound
delivery. External agent and inbound integration connectors come after that
loop is proven. Multi-organization creation and routing remain a separate
future milestone; see the Phase 2 issues on Linear for the specific gaps.

## Linear integration

The roadmap lives on Linear. Two scripts interact with the Linear GraphQL API:

```bash
# Pull the full project state as markdown (for agent context)
bun run linear:pull

# Pull as JSON for programmatic consumption
bun run linear:pull:json

# Filter to a specific milestone
bun run scripts/linear-pull.mjs --milestone "Phase 4"
```

Both require `LINEAR_API_KEY` in your environment (or `.env`, which is
gitignored). Create a key at
[Linear settings](https://linear.app/settings/account/security).

Alternatively, the unofficial [linear-cli](https://github.com/schpet/linear-cli)
(`brew install schpet/tap/linear` or `bunx linear`) provides interactive CLI
access: list, view, create, and start issues, all with `--json` output for
agent use.
