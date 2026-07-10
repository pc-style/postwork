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

For the authoritative implementation tracker, see
[`docs/plan/demo-to-product-progress.md`](docs/plan/demo-to-product-progress.md).
For the prioritized remaining work, see [`docs/next.md`](docs/next.md).

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

**OpenAI (default):**

```bash
bunx convex env set OPENAI_API_KEY sk-...
# optional; defaults to gpt-5.4-mini
bunx convex env set OPENAI_MODEL gpt-5.4-mini
```

**Vercel AI Gateway:**

```bash
bunx convex env set AI_PROVIDER gateway
bunx convex env set AI_GATEWAY_API_KEY <your-key>
bunx convex env set AI_GATEWAY_MODEL openai/gpt-5.4-mini
```

**OpenRouter:**

```bash
bunx convex env set AI_PROVIDER openrouter
bunx convex env set OPENROUTER_API_KEY <your-key>
# optional; defaults to openrouter/free
bunx convex env set OPENROUTER_MODEL openrouter/free
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
Use separate deployments and frontend environments for the public demo and the
authenticated product so their data never mix.

```bash
bunx convex dev --configure
# configure Vercel with CONVEX_DEPLOY_KEY and VITE_PLAUSIBLE_DOMAIN
# build command: bunx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'bun run build'
```

For a demo deployment, set `DEMO=true` on Convex and `VITE_DEMO=true` in the
frontend build. For product, leave both unset/false and supply the Clerk
environment values. Seed only the demo deployment:

```bash
bunx convex run --prod seed:run
```

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
  next.md              authoritative prioritized next work
  plan/                live execution tracker and historical planning records
  organizations.md     active multi-organization gap list
  archive/             completed or superseded historical material
```

## Product direction

The current priority is a trustworthy catch-up loop: make summaries visibly
stale after replies, build per-user catch-up, then add priority-aware outbound
delivery. External agent and inbound integration connectors come after that
loop is proven. Multi-organization creation and routing remain a separate
future milestone; [`docs/organizations.md`](docs/organizations.md) records its
specific gaps.
