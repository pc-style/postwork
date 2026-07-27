# Postwork: demo → product plan

> **Historical planning baseline.** The audit and phase descriptions below were
> written before the corresponding implementation work landed. Preserve the
> locked product decisions, but do not use this file to infer current status:
> [`demo-to-product-progress.md`](demo-to-product-progress.md) is the live
> execution tracker and [`../next.md`](../next.md) is the authoritative
> prioritized next-work list.

status: v2 — decisions locked (2026-07-06). All open questions answered; see
Decisions at the bottom.

## Goal

Turn the current flow-design prototype into the actual product — a post-based
team communication app (Workplace data model, modern Slack-era expectations:
agents, speed, async) — while keeping a **public demo mode** permanently
deployable on the public domain to show development progress.

The demo is not a fork. Same codebase, same UI. A single environment switch
(`DEMO` on the Convex deployment + `VITE_DEMO` on the frontend build) disables
everything that must not run in a public no-auth instance.

## Where the code is today (audit)

What actually exists vs. what is mocked:

| Layer | Real (Convex-backed) | Session-only / mocked |
| --- | --- | --- |
| Posts, nested replies, read state, priority, search | yes (`convex/posts.ts`, `replies.ts`, `reads` via `postReads`) | visitor writes go to in-memory overlay (`src/lib/store.tsx`, `local_` ids) |
| Users | seeded `users` table; identity mapping helpers exist (`convex/authUsers.ts`) | current user = in-memory switcher (`src/lib/session.tsx`), no login |
| Auth | `convex/auth.config.ts` wires shoo.dev custom JWT (ES256, JWKS) | frontend never authenticates; `tokenIdentifier` unused in practice |
| Spaces | `space` is a plain string label on posts | space pages render mock cards from `src/lib/spaces.tsx`; README-claimed `spaces`/`spaceMemberships` tables do not exist in `schema.ts` |
| Walls | `wallOwnerId` on posts (real column) | created only through session overlay |
| AI summaries | real action (`convex/ai.ts`, provider-switchable) + baked seed summaries | demo visitors get overlay-only regeneration |
| Agent tasks | `convex/agentTasks.ts` action exists | task state in-memory (`src/lib/agentTasks.tsx`); README-claimed `agentTasks` table absent |
| Flash experiments | votes table exists | experiments themselves are prototype surfaces to prune (see `docs/next.md` §4) |
| Orgs | — | `LinkedOrgsPage` is mock; no `orgs` table |

Key structural fact: **the write path is duplicated.** Every mutation exists
twice — once as a Convex mutation and once as an overlay operation in
`store.tsx`. This duplication is the single biggest thing to eliminate: in the
product, writes hit Convex; in demo mode, writes stay overlay-only (decided:
keep the overlay as the demo mechanism).

## The demo/product switch — design

One boolean, two halves:

- **Backend**: `DEMO=true` Convex env var. Read inside mutations/actions.
  - In demo: mutations that would persist visitor data throw a typed
    `demo_read_only` error (or are simply never called because the frontend
    routes writes to the overlay).
  - AI actions: either disabled or rate-limited/keyless in demo.
- **Frontend**: `VITE_DEMO=true` at build time.
  - Enables: user switcher, session overlay store, "this is a demo" affordances,
    seed personas.
  - Disables: login requirement, real profile editing, invites, anything
    billing/admin.
- A single module `src/lib/demoMode.ts` (frontend) and `convex/lib/demo.ts`
  (backend) so the check is never scattered as raw `import.meta.env` reads.

Deployment shape: **two Convex deployments, one repo.**

- `postwork.pcstyle.dev` → demo Convex project, `DEMO=true`, seeded, reseedable.
- product domain → production Convex project, `DEMO` unset, real auth required.
- Vercel: two projects (or one project + preview env) pointing at the same repo
  with different `CONVEX_DEPLOY_KEY` + `VITE_DEMO`.

This means demo data can never touch product data, and "wipe and reseed" stays
a one-liner (`bunx convex run --prod seed:run` against the demo deployment only).

## Phases

### Phase 0 — consolidation (prerequisite, mostly `docs/next.md`)

Do this before any product work; it removes prototype split-brain that would
otherwise be built on top of.

1. Spaces become real post threads (next.md §1): add `spaces` +
   `spaceMemberships` tables, migrate `posts.space` string label → `spaceId`
   reference (keep label denormalized during migration), make `SpacePage`
   render real posts through the same `PostCard`/`PostPage` primitives.
2. Consolidate composers (next.md §2): one composer vocabulary for post /
   reply / wall / space-post.
3. Prune flash experiments + LinkedOrgs mock (next.md §4): archive shipped and
   deprecated experiments; keep the lab route behind demo mode only (decided:
   flash lab is demo-only; LinkedOrgs mock archived; walls stay in the product).
4. Introduce the demo-mode switch (`VITE_DEMO` / `DEMO`) now, defaulting the
   current behavior to demo=true, so all later work lands behind the correct
   side of the flag from day one.

Exit criteria: one write path per feature, spaces durable, `bun run build`
green, demo deploy visually unchanged.

### Phase 1 — auth + real write path

1. **Clerk auth** (decision Q1=c):
   - Replace `convex/auth.config.ts` shoo.dev customJwt provider with Clerk's
     Convex integration (`convex/react-clerk`, Clerk JWT template named
     `convex`).
   - Remove `@shoojs/react`; add `@clerk/clerk-react`.
   - Keep `convex/authUsers.ts` as the identity→`users` doc resolution point —
     it already keys on `tokenIdentifier`, which works unchanged with Clerk.
   - Every mutation calls `ctx.auth.getUserIdentity()`; unauthenticated writes
     rejected in product mode.
   - Clerk gives login UI, user management, and (later) Clerk Organizations +
     invites for free — aligns with Phase 2.
   - Demo mode: Clerk is not loaded at all (`VITE_DEMO=true` skips the
     ClerkProvider and mounts the user switcher instead).
2. Replace the overlay store as the primary write path:
   - product mode: mutations go straight to Convex; delete overlay merging for
     authenticated users.
   - demo mode: keep the overlay exactly as-is (it is a good demo mechanism —
     zero-persistence visitor sandboxing).
   - `store.tsx` becomes a thin interface with two implementations
     (ConvexWrites / OverlayWrites) selected by demo mode.
3. User lifecycle: signup → create `users` doc (name, title, avatar), profile
   editing, admin role assignment.
4. Access control in every query/mutation: author checks, space membership
   checks, admin-only operations.

Exit criteria: a real person can log in on the product deployment, post,
reply, mark read — all persisted; demo deployment behavior unchanged.

### Phase 2 — multi-tenancy groundwork (decision Q3=b: defensive middle ground)

Schema now, UX later:

1. Add `orgs` table and `orgId` columns + `orgId`-prefixed indexes to posts,
   spaces, users(membership), postReads — **while all data is still throwaway**
   (migration is free today; painful with real customer data).
2. Seed script creates one demo org; product deployment starts as one real org.
3. All queries scoped by `orgId` from day one, even with a single org.
4. **Deferred until needed:** invites UI, org switching, Clerk Organizations
   sync. When the time comes, Clerk Organizations maps onto these columns
   directly (org id in the JWT claims).

### Phase 3 — product hardening

1. Rate limiting on mutations and AI actions (Convex rate-limit component).
2. Input limits + validation (post/reply body size, title length) via shared
   zod schemas.
3. Notifications: in-app unread is done; add email or web-push digest
   (priority-aware) — differentiator per the product thesis (triage, not
   notification soup).
4. Pagination: feed and reply queries currently unbounded; add cursor
   pagination before real data volume.
5. **Image attachments only** (decision Q5=b) via Convex storage: paste or
   drop screenshots into posts/replies; served through Convex file URLs with
   size limits. Generic file attachments deferred past v1.
6. Moderation/admin: delete/edit posts, deactivate users.
7. Observability: Convex log streams, error reporting (Sentry or similar),
   Plausible stays for the demo domain.

### Phase 4 — the differentiator loop (agents)

1. Persist agent tasks (`agentTasks` table — README already claims it; make it
   true): task lifecycle rows, results attached to posts, `/agents` page reads
   from Convex.
2. Summary staleness: mark summary stale when `lastActivityAt >
   summaryUpdatedAt`; optionally auto-refresh on a schedule (Convex cron).
3. Agent identities as first-class users (`isAgent` already in schema): agents
   post replies via authenticated server-side actions.
4. Per-user catch-up digest ("what changed since you left") — the core thesis
   feature: unread posts + priorities + summaries composed into one view.
5. Inbound integrations later (webhooks: GitHub, deploys → posts), explicitly
   out of scope until the above is real.

### Phase 5 — demo-mode productization

1. Demo banner: quiet, on-brand ("public demo — data resets, pick a teammate").
2. Reseed cadence: cron or manual; keep seed narrative current with real
   features so the demo shows development progress (user's stated goal).
3. Feature flags for in-progress features: show them in demo behind a "lab"
   affordance, keep them off in product until ready.
4. README rewrite: split "run the demo" vs "run the product" docs; fix the
   schema/layout claims that drifted.

## Feature flag inventory (what `DEMO=true` changes)

| Capability | Product | Demo |
| --- | --- | --- |
| Login | required (Clerk) | none; user switcher |
| Writes | Convex mutations, authz-checked | session overlay only; backend read-only |
| AI generate/regenerate | real, rate-limited per user | overlay-only (session summary, not persisted) |
| Agent tasks | persisted | in-memory |
| Profile edit / invites / admin | enabled | hidden |
| Seed/reseed | never | idempotent `seed:run` |
| Analytics | product domain or none | Plausible on demo domain |
| Flash experiments lab | hidden | visible (demo-only lab) |
| Image uploads | enabled (Convex storage) | disabled (overlay can't hold files) |

## Risks

- Schema migration for `posts.space` string → `spaceId` and adding `orgId`:
  do both while data is throwaway (now), they're free; later they need real
  migrations.
- Overlay store: keeping it for demo means maintaining the interface split
  forever; acceptable cost because it's also the best zero-persistence demo
  mechanism available.
- Clerk introduces an external dependency + cost at scale; mitigated by
  `authUsers.ts` remaining the only identity-resolution point (swap-out stays
  contained to `auth.config.ts` + the provider component).
- Convex anonymous local deployment stays the offline dev loop; nothing in the
  plan changes `bun run dev`. Product-mode local dev additionally needs Clerk
  dev-instance keys in `.env.local`.

## Decisions (locked 2026-07-06)

- **Q1 auth → Clerk.** Drop the shoo.dev customJwt scaffold; use Clerk's
  Convex integration. `authUsers.ts` stays as the resolution layer.
- **Q2 demo writes → keep the session overlay.** Demo backend stays read-only;
  visitor writes vanish on refresh. No reset jobs, no abuse surface.
- **Q3 multi-tenancy → defensive.** `orgId` in schema/indexes/queries now;
  invites + org-switching UI deferred.
- **Q4 surfaces → flash experiments become demo-only lab; LinkedOrgs mock
  archived; walls kept as a real product feature** (`wallOwnerId` already in
  schema).
- **Q5 attachments → images only in v1**, via Convex storage; files later.
