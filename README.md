# Postwork

A post-based team communication app — the spiritual successor to Facebook
Workplace, built on Theo's thesis that **structured posts beat Slack-style chat**
for organizational communication.

Posts (not channels) are the top-level unit. Each post is a durable thread with
nested replies, activity bumping, priority + unread states, full-text search,
and an **agent-summary slot** so a returning teammate can catch up in seconds.

> [!WARNING]
> **This is a demo, not a production app.** There is **no authentication** — the
> header has an in-app "user switcher" that lets anyone act as any seeded
> teammate, and every visitor sees the same shared data. There is no access
> control, no rate limiting, no moderation, and no privacy boundary. All people,
> posts, and metrics are fictional seed data. Do not put real or sensitive
> information into a deployed instance.

## Stack

- **Bun** — tooling / package manager
- **Vite + React 19 + TypeScript** — app loop
- **TanStack Router** — routing (`/` feed, `/posts/$id` detail)
- **Convex** — realtime database + serverless functions
- **AI SDK v7** (`ai@beta`) — agent summaries, with a pluggable provider

## Run it

The repo ships pre-wired to a **local Convex deployment** with seed data, so it
works immediately:

```bash
bun install
bun run dev            # runs Convex + Vite together
```

Open http://localhost:5173. Use the UserSwitcher at the bottom of the left
sidebar to **switch teammates** and watch unread/priority states change per user.

If the database is empty, seed it:

```bash
bun run seed
```

### Switch to your Convex Cloud account

```bash
bunx convex dev --configure   # pick your team + project (cloud)
bun run seed                  # reseed the cloud deployment
bun run dev
```

## Agent summaries (live AI)

Every post has a baked demo summary so the feature is visible out of the box.
The **Generate / Regenerate** button calls a real model via the AI SDK. Pick a
provider with Convex environment variables.

**OpenAI directly (default — recommended for OpenAI models):**

```bash
bunx convex env set OPENAI_API_KEY sk-...
# optional, defaults to gpt-5.4-mini:
bunx convex env set OPENAI_MODEL gpt-5.4-mini
```

That's it — `AI_PROVIDER` defaults to `openai`. Any chat model works
(`gpt-5.4-mini`, `gpt-5.4`, `gpt-5.5`, `gpt-5.4-nano`, …).

**Vercel AI Gateway (one key, routes to OpenAI + others, adds observability):**

```bash
bunx convex env set AI_PROVIDER gateway
bunx convex env set AI_GATEWAY_API_KEY <your-key>
bunx convex env set AI_GATEWAY_MODEL openai/gpt-5.4-mini
```

**OpenRouter (one key for OpenRouter's model catalog):**

```bash
bunx convex env set AI_PROVIDER openrouter
bunx convex env set OPENROUTER_API_KEY <your-key>
# optional, defaults to openai/gpt-5.4-mini:
bunx convex env set OPENROUTER_MODEL openai/gpt-5.4-mini
# optional: bunx convex env set OPENROUTER_BASE_URL https://openrouter.ai/api/v1
```

**Pioneer (OpenAI-compatible, for fine-tuned Pioneer models):**

```bash
bunx convex env set AI_PROVIDER pioneer
bunx convex env set PIONEER_API_KEY <your-key>
bunx convex env set PIONEER_MODEL <your-training-job-id>
# optional: bunx convex env set PIONEER_BASE_URL https://api.pioneer.ai/v1
```

Without a key, the button surfaces a friendly "configure a provider" message and
the baked summaries remain.

## Deploy a demo (Vercel + Convex Cloud)

The backend runs on **Convex Cloud**; the frontend is a static **Vite** build on
**Vercel**. The Vercel build command deploys the Convex functions first, then
builds the frontend with `VITE_CONVEX_URL` injected automatically.

> Reminder: this deploys the **public, no-auth demo** described at the top of this
> file. Anyone with the URL can read and write everything. Use throwaway data.

### 1. Link the project to Convex Cloud (one time, local)

```bash
bun install
bunx convex dev --configure        # log in, pick a team, create a project
```

Leave it running or stop it with Ctrl-C once it says the deployment is ready.

### 2. Get a production deploy key

In the Convex dashboard: your project → **Settings → Deploy keys →
Generate Production Deploy Key**. Copy it (starts with `prod:`).

### 3. (Optional) Enable live AI summaries on production

Baked demo summaries work without this. For live Generate/Regenerate, set the
provider vars on the **production** deployment:

```bash
# OpenAI directly (default provider)
bunx convex env set --prod OPENAI_API_KEY sk-...
bunx convex env set --prod OPENAI_MODEL  gpt-5.4-mini   # optional

# …or Vercel AI Gateway
bunx convex env set --prod AI_PROVIDER gateway
bunx convex env set --prod AI_GATEWAY_API_KEY <your-key>
bunx convex env set --prod AI_GATEWAY_MODEL  openai/gpt-5.4-mini

# …or OpenRouter
bunx convex env set --prod AI_PROVIDER openrouter
bunx convex env set --prod OPENROUTER_API_KEY <your-key>
bunx convex env set --prod OPENROUTER_MODEL  openai/gpt-5.4-mini   # optional
```

### 4. Deploy on Vercel

Push the repo to GitHub and import it at vercel.com (or run `bunx vercel`). Set:

| Setting | Value |
| --- | --- |
| Framework preset | **Vite** |
| Install command | `bun install` |
| Build command | `bunx convex deploy --cmd-url-env-var-name VITE_CONVEX_URL --cmd 'bun run build'` |
| Output directory | `dist` |
| Environment variable | `CONVEX_DEPLOY_KEY` = the `prod:` key from step 2 |
| Environment variable | `VITE_PLAUSIBLE_DOMAIN` = `postwork.pcstyle.dev` |

Deploy. Do **not** set `VITE_CONVEX_URL` yourself — `convex deploy --cmd` sets it
during the build to point at your production deployment.

Plausible's NPM verifier expects the Vite build to include the same domain you
registered in Plausible. For this Vercel demo, that domain is
`postwork.pcstyle.dev`. Add that custom domain under Vercel Project → Domains,
redeploy after setting `VITE_PLAUSIBLE_DOMAIN`, then verify the Plausible NPM
installation against `postwork.pcstyle.dev`.

### 5. Seed the production data (one time)

```bash
bunx convex run --prod seed:run
```

Open the Vercel URL. To wipe and reseed at any time, re-run step 5 (it is
idempotent). To take the demo down, delete the Vercel project and the Convex
project.

## Why posts beat chat (what the seed data shows)

- **Durable decisions** — the release-train decision is one findable post, not a
  scrolled-past chat message.
- **Threaded context** — nested replies keep sub-discussions attached to the topic.
- **Async hand-offs** — roadmap review and incident post-mortem happen in threads,
  no meeting required.
- **Catch up fast** — agent summaries + unread/priority states triage the feed.
- **Search** — full-text search over titles and bodies finds past decisions instantly.

## Project layout

```
convex/
  auth.config.ts       Convex auth provider config
  schema.ts            users · posts · replies · postReads · flashExperimentVotes · agentTasks · orgs · spaces · spaceMemberships
  posts.ts             feed (activity-bumped) · search · get
  replies.ts           listForPost · create, with nested replies + activity bump
  discussions.ts       getThread · listCounts · ensureThread · addMessage
  spaces.ts            list · membershipsForSpace · feedForSpace
  users.ts             list · updateProfile
  ai.ts                summarizePost action (provider switch: openai | gateway | pioneer)
  agentTasks.ts        runAgent action for post/space agent replies
  flashExperiments.ts  listVotes · setVote
  authUsers.ts         identity-to-user helpers
  avatarPalette.ts     seeded avatar color helpers
  seed.ts              narrative demo data + baked summaries
src/
  routes/              AgentsPage · FeedPage · FlashExperimentPage · FlashExperimentsPage · LinkedOrgsPage · PostPage · RootLayout · SpacePage · SpacesPage · WallPage
  components/          AccentPanel · AgentSummary · AgentTag · AgentTasksPanel · AppShell · Avatar · Button · Chip · CodeBlock · Composer · Dialog · EmptyState · LoadingState · Markdown · NewPostDialog · OrgSquare · PageHeader · PostCard · PostForm · PostMetaChips · QuickPostBar · ReplyTree · RichText · SendAgentButton · StatusChip · UserRoleTag · UserSwitcher · WallPostDialog
  lib/                 agentMentions · agentTasks · codeFence · convexClient · format · providers · replyTree · session · shiki · spaces · store · types · useDocumentTitle · usePopoverDismiss
```
