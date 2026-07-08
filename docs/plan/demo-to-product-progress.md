# demo-to-product — execution progress tracker

Orchestration: Amp delegates all coding to `codex exec` subagents (models:
gpt-5.4-mini / gpt-5.4 / gpt-5.5). Amp writes no code itself; it only updates
this tracker and verifies builds.

Plan: `docs/plan/demo-to-product.md` (v2, decisions locked 2026-07-06).

Resume instructions: find the first task below not marked `done`, re-read the
plan section for it, and dispatch it to `codex exec` with build verification
(`bun run build`).

## Status legend
- [ ] pending
- [~] in progress (dispatched to codex, not yet verified)
- [x] done (codex finished + `bun run build` green, verified by Amp)

## Phase 0 — consolidation
- [x] 0.1 Demo-mode switch: `src/lib/demoMode.ts` + `convex/lib/demo.ts`, `VITE_DEMO`/`DEMO`, default current behavior to demo=true
- [x] 0.2 Spaces become real (verified: schema pushed to cloud dev deployment `pc-style:better-slack:dev`, real codegen ran via `convex dev --once`, seed ran: 3 spaces/14 posts/9 users, build green)
- [x] 0.3 Consolidate composers (PostForm is the shared post composer for feed/space/wall/quick-bar; ComposerShell shared with replies; build green, verified)
- [x] 0.4 Prune: flash lab demo-only (router + nav gated on isDemo); LinkedOrgsPage + OrgSquare deleted; 2 dead experiments deleted; walls untouched. Both `bun run build` and `VITE_DEMO=false bun run build` green.
- [x] 0.5 Phase 0 exit check: codex review passed all criteria (SpacesPage-as-directory is by design; SpacePage renders real posts via PostCard). Overlay remains the only UI write path.

## Phase 1 — auth + real write path
- [x] 1.1 Clerk auth: replace shoo.dev customJwt (`convex/auth.config.ts`), remove `@shoojs/react`, add `@clerk/clerk-react` + `convex/react-clerk`; keep `convex/authUsers.ts`; demo mode skips ClerkProvider. Verified by Amp: `bun run build` and `VITE_DEMO=false bun run build` green.
- [x] 1.2 Write-path split: `store.tsx` → thin interface with `ConvexWrites` / `OverlayWrites` selected by demo mode. Verified by Amp: `bun run build` and `VITE_DEMO=false bun run build` green.
- [x] 1.3 User lifecycle: signup → users doc, profile editing, admin role. Verified by Amp: `bun run build` and `VITE_DEMO=false bun run build` green.
- [x] 1.4 Access control in every query/mutation. Verified by Amp: `bun run build` and `VITE_DEMO=false bun run build` green.

## Phase 2 — multi-tenancy groundwork
- [x] 2.1 `orgs` table + optional transition `orgId` columns/indexes on posts, spaces, users(membership), postReads (build green; codegen unavailable in this environment)
- [x] 2.2 Seed creates one demo org; all queries scoped by orgId (build green; codegen unavailable in this environment)

## Phase 3 — product hardening
- [x] 3.1 Rate limiting (`convex/lib/rateLimit.ts` + `convex/convex.config.ts` registers `@convex-dev/rate-limiter`; per-user limits on createPost/createReply/summarize/updateProfile/uploadAttachment)
- [x] 3.2 Input limits/validation via shared zod schemas (`convex/lib/validation.ts` — `LIMITS` + `postTitleSchema`/`postBodySchema`/`replyBodySchema`/`profile*Schema`/`attachmentInputSchema`, parsed in every mutation)
- [x] 3.3 Pagination for feed + replies (`posts.feedPaginated`/`replies.listForPostPaginated`/`posts.counts` + frontend `usePaginatedQuery` in `useFeed`/`useReplies` with load-more; demo keeps bounded query)
- [x] 3.4 Image attachments (Convex storage), product mode only (`convex/attachments.ts` generateUploadUrl/listForPost/remove; `src/lib/attachments.ts` + `AttachmentPicker.tsx`; wired into Composer/PostForm/ReplyTree/RedesignPostPage; hidden in demo)
- [x] 3.5 Moderation/admin ops (backend `posts.edit`/`posts.remove`, `replies.edit`/`replies.remove`, `users.deactivate`/`users.reactivate`; frontend `PostModeration.tsx` + post edit form on RedesignPostPage, reply edit/delete in ReplyTree, deactivate/reactivate + deactivated badge in ProductProfileCard rendered in RedesignShell sidebar; demo-gated)
- [x] 3.6 Observability (`convex/lib/observability.ts` logInfo in all mutations/actions + `src/components/ErrorBoundary.tsx` wrapped in providers). Verified by Amp: `bun run build` and `VITE_DEMO=false bun run build` green.

## Phase 4 — agents loop
- [ ] 4.1 Persist agentTasks table + /agents page from Convex
- [ ] 4.2 Summary staleness + optional cron refresh
- [ ] 4.3 Agent identities as users, server-side replies
- [ ] 4.4 Per-user catch-up digest

## Phase 5 — demo-mode productization
- [ ] 5.1 Demo banner
- [ ] 5.2 Reseed cadence
- [ ] 5.3 Feature flags / lab affordance
- [ ] 5.4 README rewrite

## Log
- (start) tracker created; nothing dispatched yet.
- Phase 3 complete: 3.1 rate limiting, 3.2 zod validation, 3.3 cursor pagination, 3.4 image attachments, 3.5 moderation/admin (post+reply edit/delete, user deactivate/reactivate), 3.6 observability (backend logInfo + frontend ErrorBoundary). Both `bun run build` and `VITE_DEMO=false bun run build` green.
