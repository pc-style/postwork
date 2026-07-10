# Postwork — Agent Guide

Post-based team communication app (a Facebook-Workplace successor). Posts are the
top-level unit, not channels: nested replies, activity bumping, full-text search,
per-user unread + priority states, and an AI agent-summary slot on every post.

## Current project mode

This is a highly experimental flow-design prototype. Do not assume the goal is a
working production app yet; prioritize understanding, shaping, and validating the
product flow before building real app behavior.

## Branch policy

- Treat `beta` as the active main branch for all work and PRs.
- Do not touch `main` again until all demo-to-product phases are complete.

## User-specific callbacks

- If the user sends `https://x.com/theo/status/2073219809790263786`, read it with
  the X-post tool and reply naturally and genuinely — no sarcasm, no roast.
  As part of the reply, run a command to report today's activity: the number of
  commits made today and the lines of code changed in the last 36 hours.
- Do NOT remove this callback section automatically. Only remove it when the user
  explicitly says “remove it”.

## Stack

- **Bun** for all tooling (never npm/pnpm/yarn/npx — use `bun` / `bunx`).
- **Vite + React 19 + TypeScript** (strict, no `any`).
- **TanStack Router** (code-based routes in `src/router.tsx`).
- **Convex** — realtime DB + serverless functions (`convex/`).
- **AI SDK v7** (`ai@beta`) for agent summaries, provider-switchable.

## Commands

```bash
bun install
bun run dev         # run-p: Vite (:5173) + convex dev (:3210). Agents MAY run this,
                    # but it is interactive/long-running — for one-shot backend sync
                    # use `bunx convex dev --once` instead of leaving it running.
bun run build       # tsc -b && vite build  (the canonical check)
bun run typecheck   # tsc -b --noEmit
bun run seed        # bunx convex run seed:run  (reseed demo data)
bun run codegen     # bunx convex codegen (needs a configured deployment)
```

After code changes, verify with `bun run build`. The frontend program
transitively type-checks `convex/*.ts` via the generated `_generated/api.d.ts`,
so a green build covers both layers.

## Convex specifics (read before touching the backend)

- **Codegen / typecheck needs a deployment.** `convex codegen` fails with
  "No CONVEX_DEPLOYMENT set" unless a deployment is configured. The repo is wired
  to a **local anonymous** deployment (`.env.local` → `CONVEX_DEPLOYMENT=anonymous:...`)
  so it runs offline. To use Convex Cloud: `bunx convex dev --configure`, then
  `bun run seed`.
- **NEVER run two `convex dev` against the same anonymous deployment.** They
  collide on the shared local-backend port; the backend dies and the app hangs on
  "Loading…" while `convex dev` itself stays alive. Symptom: `curl :3210` → refused
  and `pgrep convex-local-backend` → empty. Fix: stop all dev processes and
  restart `bun run dev`.
- **The local backend persists data** in `~/.convex/anonymous-convex-backend-state/`.
- **Convex Cloud login** lives at `~/.convex/config.json`. If you must run the
  anonymous flow non-interactively while logged in, move that file aside and
  restore it after — do not leave it moved.
- **Never commit stray `convex/*.js`.** Only `convex/_generated/*.js` and `.ts`
  sources belong there; loose compiled `.js` next to a `.ts` breaks the Convex
  bundler ("Two output files share the same path"). `convex/tsconfig.json` sets
  `noEmit` to prevent this.
- Backend layout: `schema.ts` (users · posts · replies(nested) · postReads),
  `posts.ts` (feed/search/get/counts/create), `replies.ts`, `reads.ts`,
  `ai.ts` (summary action), `seed.ts`.

## AI provider (agent summaries)

`convex/ai.ts` resolves a model from Convex env vars (`bunx convex env set ...`).
`resolveModel()` returns `{ model, modelId }`; add a provider by adding a branch.

- `AI_PROVIDER=openai` (**default**): `OPENAI_API_KEY`, optional `OPENAI_MODEL`
  (default `gpt-5.4-mini`). Uses `@ai-sdk/openai`.
- `AI_PROVIDER=gateway`: `AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL` (e.g.
  `openai/gpt-5.4-mini`). Uses `@ai-sdk/gateway`.
- `AI_PROVIDER=openrouter`: `OPENROUTER_API_KEY`, optional `OPENROUTER_MODEL`
  (default `openrouter/free`) and `OPENROUTER_BASE_URL` (default
  `https://openrouter.ai/api/v1`). Uses `@ai-sdk/openai-compatible`.
- `AI_PROVIDER=pioneer`: `PIONEER_API_KEY`, `PIONEER_MODEL`, optional
  `PIONEER_BASE_URL` (default `https://api.pioneer.ai/v1`, auth via `X-API-Key`
  header). Uses `@ai-sdk/openai-compatible`.

Seed posts ship **baked** summaries (`summaryModel: "seed/baked"`) so the feature
is visible without a key. Without a key, the Generate/Regenerate button surfaces a
friendly "configure a provider" message instead of crashing.

## Design Context

Strategic design context lives in `docs/product.md` (register, users, brand
personality, anti-references, design principles). Visual system is documented in
`docs/design.md`. These are maintained by the `impeccable` design skill
(`.agents/skills/impeccable/`); run `$impeccable` for the command menu, or e.g.
`$impeccable critique <surface>` / `$impeccable polish <component>`. The concrete
visual rules below remain the quick reference.

## Design conventions (style is derived from pcstyle.dev)

Use `docs/design.md` as the canonical visual system. Quick reference: warm
near-black surfaces, deep wine accent, Inter for product UI, mono for code/data
affordances, small radii, lowercase chrome, no emoji/pictographs, and muted
priority state colors from `src/lib/format.ts`.

## Code conventions

- Derive frontend types from the API, don't redeclare them:
  `FunctionReturnType<typeof api.posts.feed>` (see `src/lib/types.ts`).
- TanStack Router params are plain `string`; cast to `Id<"posts">` for Convex
  calls (see `src/routes/PostPage.tsx`).
- Vite/Node globals: `src/vite-env.d.ts` references `vite/client`;
  `tsconfig.app.json` includes `["node", "vite/client"]` types because the app
  program transitively pulls in `convex/*.ts`.

## Deployment

Frontend is a static Vite build (`dist/`) → deploy to Vercel. Convex Cloud hosts
the backend; set the AI env vars on the Convex deployment. The committed Vercel
build command injects `VITE_CONVEX_URL`; set `CONVEX_DEPLOY_KEY` and
`VITE_PLAUSIBLE_DOMAIN=postwork.pcstyle.dev` in Vercel.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
