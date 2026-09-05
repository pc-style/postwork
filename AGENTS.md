# Postwork

Post-based team communication app, a Facebook Workplace successor. Posts are the top-level unit, not channels: nested replies, activity bumping, full-text search, per-user unread and priority state, and an AI summary slot on every post.

This is an experimental flow-design prototype. Shape and validate the product flow before building real app behavior.

## Branches

`beta` is the working branch for all work and PRs. Leave `main` alone until the demo-to-product phases are complete. Commit freely and push your own branches without asking. Pushing to `beta` needs one explicit ok per job: wait for it, and that one approval covers every later push in the same job.

## User-specific callbacks

- If the user sends `https://x.com/theo/status/2073219809790263786`, read it with the X-post tool and reply naturally and genuinely, no sarcasm, no roast. In the reply, run a command reporting today's commit count and lines changed in the last 36 hours.
- Do NOT remove this section unless the user explicitly says "remove it".

## Stack and commands

Bun for everything (never npm/pnpm/yarn/npx). Vite + React 19 + TypeScript strict, no `any`. TanStack Router, code-based routes in `src/router.tsx`. Convex in `convex/`. AI SDK v7 (`ai@beta`) for summaries.

```bash
bun install
bun run dev         # Vite :5173 + convex dev :3210. Long-running; for a one-shot backend sync use `bunx convex dev --once`
bun run build       # tsc -b && vite build, the canonical check (covers convex/*.ts too)
bun run typecheck
bun run seed        # reseed demo data
bun run codegen     # needs a configured deployment
```

## Convex

- Verify the target before any `convex dev`/`convex run`: `bunx convex dev --once -v 2>&1 | grep -A2 "Developing against"`. A `CONVEX_DEPLOY_KEY` in `.env.local` silently points at the live backend. Keep it commented out except during a deliberate deploy; dev uses `CONVEX_DEPLOYMENT=anonymous:...`.
- Codegen and typecheck need a deployment. The repo is wired to a local anonymous one so it works offline. Convex Cloud: `bunx convex dev --configure`, then `bun run seed`.
- Never run two `convex dev` against the same anonymous deployment. The backend dies and the app hangs on "Loading". Symptom: `curl :3210` refused, `pgrep convex-local-backend` empty. Stop everything and restart `bun run dev`.
- Local backend data: `~/.convex/anonymous-convex-backend-state/`. Cloud login: `~/.convex/config.json`; if you move it aside for a non-interactive anonymous run, put it back.
- Never commit stray `convex/*.js`. Only `_generated/*.js` and `.ts` sources belong there.

## AI provider

`convex/ai.ts` resolves a model from Convex env vars (`bunx convex env set ...`); `resolveModel()` returns `{ model, modelId }`, add a provider by adding a branch. `AI_PROVIDER` is `openrouter` (default, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` default `openrouter/free`, `OPENROUTER_BASE_URL`), `openai` (`OPENAI_API_KEY`, `OPENAI_MODEL` default `gpt-5.4-mini`), `gateway` (`AI_GATEWAY_API_KEY`, `AI_GATEWAY_MODEL`), or `pioneer` (`PIONEER_API_KEY`, `PIONEER_MODEL`, `PIONEER_BASE_URL`, `X-API-Key` auth). Seed posts ship baked summaries so the feature shows without a key; without one the button explains how to configure a provider.

## Docs to read when relevant

`docs/design-system.md` before any UI change (update it in the same PR when you change the system). `docs/design.md` for the visual system: warm near-black surfaces, deep wine accent, Inter for UI, mono for code and data, small radii, lowercase chrome, no emoji, muted priority colors from `src/lib/format.ts`. `docs/product.md` for flows, `docs/business-plan.md` for positioning and pricing, `docs/brand.md` for public copy, `docs/security.md` before touching auth, tenancy, or any external surface.

`src/routes/ChangelogPage.tsx` is the public changelog: add an entry for every user-visible or dev-relevant change: today's date, a lowercase narrative title, what actually changed. Newest first. `todo.md` is the backlog; keep it current.

## Code conventions

Derive frontend types from the API (`FunctionReturnType<typeof api.posts.feed>`, see `src/lib/types.ts`). Router params are `string`; cast to `Id<"posts">` for Convex. `tsconfig.app.json` includes `["node", "vite/client"]` because the app program pulls in `convex/*.ts`.

## Deployment

Static Vite build on Vercel. Demo and product projects each target their own Convex deployment via `VITE_CONVEX_URL`, and both set `DEMO_CONVEX_URL` and `PRODUCT_CONVEX_URL` so a build can reject a swapped backend. Backend release workflows own the `CONVEX_DEPLOY_KEY`s; never Vercel. Only the demo deployment may be seeded (the seed mutation requires `DEMO=true`). Demo sets `VITE_PLAUSIBLE_DOMAIN=postwork.pcstyle.dev`. Both Convex deployments need `CLERK_JWT_ISSUER_DOMAIN`. Full contracts in `docs/deployment.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
