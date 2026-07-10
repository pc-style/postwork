# Demo-to-product — execution tracker

This is the implementation tracker for the checked-out `beta` branch as of
2026-07-10. For prioritized remaining work, use
[`../next.md`](../next.md). The original decision record is
[`demo-to-product.md`](demo-to-product.md); its initial audit is historical,
not a statement of current implementation.

## Status legend

- [x] implemented in the repository
- [ ] not yet implemented
- [~] partially implemented or requires deployed/manual verification

## Phase 0 — consolidation

- [x] 0.1 Demo-mode switch: `src/lib/demoMode.ts` + `convex/lib/demo.ts`;
  `VITE_DEMO`/`DEMO` default to the public demo.
- [x] 0.2 Durable spaces and memberships, with one seeded org and org-scoped
  queries.
- [x] 0.3 Shared composer vocabulary for post, reply, wall, and space flows.
- [x] 0.4 Flash lab is demo-only; the LinkedOrgs mock and obsolete experiments
  were removed. Walls remain a product surface.

## Phase 1 — auth and real write path

- [x] 1.1 Clerk product authentication; demo skips Clerk and retains the
  seeded-persona switcher.
- [x] 1.2 Product writes use Convex; demo writes remain session overlay only.
- [x] 1.3 User lifecycle includes profile editing and admin role support.
- [x] 1.4 Product queries and mutations enforce authenticated, org-scoped
  access.
- [x] 1.5 Invite-gated activation and blocking profile onboarding. The design
  plan is retained as completed history in `invite-gated-signup.md`; full
  Clerk/browser QA remains a deployed manual check.

## Phase 2 — multi-tenancy groundwork

- [x] 2.1 `orgs` plus org-prefixed indexes and transition `orgId` columns.
- [x] 2.2 One default seeded org and org-scoped query paths.
- [ ] 2.3 Multi-org creation, resolution, membership, routing, and required
  `orgId` migration. See `../organizations.md`.

## Phase 3 — product hardening

- [x] 3.1 Per-user rate limiting for mutation and AI paths.
- [x] 3.2 Shared input limits and Zod validation.
- [x] 3.3 Cursor pagination for feed and replies.
- [x] 3.4 Product-mode image attachments through Convex storage.
- [x] 3.5 Moderation/admin operations: edit/delete, deactivate/reactivate,
  invites, access requests, and audit history.
- [~] 3.6 Structured Convex `logInfo` coverage and a React `ErrorBoundary`.
  External error reporting is still missing.
- [ ] 3.7 Priority-aware outbound email or web-push digest delivery. In-app
  unread is present, but no outbound delivery exists.

## Phase 4 — agent catch-up loop

- [x] 4.1 Persisted `agentTasks` and `/app/agents` reads from Convex.
- [ ] 4.2 Summary staleness after replies, with an optional scheduled refresh.
- [x] 4.3 First-class `isAgent` users and server-created result replies.
  The runner is an internal simulated AI workflow, not an external coding-agent
  connector.
- [ ] 4.4 Per-user catch-up digest.
- [ ] 4.5 Real external/inbound agent and integration connectors, after the
  catch-up loop is proven.

## Phase 5 — demo-mode productization

- [ ] 5.1 Quiet public-demo banner.
- [ ] 5.2 Defined reseed cadence and current seed narrative.
- [ ] 5.3 Feature-flag and lab policy beyond the existing demo-only flash lab.
- [x] 5.4 README and live-doc synchronization.

## Verification

- [x] `bun run build` passed before this documentation cleanup.
- [x] `VITE_DEMO=false bun run build` passed before this documentation cleanup.
- [~] Repeat both builds after any implementation change; deployed
  Clerk/browser/accessibility coverage is not yet recorded here.
