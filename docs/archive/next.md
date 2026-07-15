# Next work

This is the authoritative, prioritized next-work list. It describes the
checked-out implementation as of 2026-07-10; the execution record lives in
[`plan/demo-to-product-progress.md`](plan/demo-to-product-progress.md).

Postwork is still an experimental flow-design prototype. Prefer validating the
core async communication flow over adding production breadth.

## 1. Complete the catch-up loop

Make a post summary visibly stale when replies advance `lastActivityAt` beyond
`summaryUpdatedAt`. Explain what context the summary covers and decide whether
an opt-in Convex cron refresh is useful after the manual path is clear.

Then add the per-user catch-up digest: unread posts and priorities composed
with summaries into one focused return-to-work view. This is the product thesis,
not a generic notification feed.

Relevant areas: `convex/ai.ts`, `convex/posts.ts`, `convex/replies.ts`,
`src/components/AgentSummary.tsx`, the product app routes, and a new digest
surface as needed.

## 2. Deliver priority-aware notifications

Keep in-app unread as the baseline, then add outbound email or web-push
delivery that respects priority and avoids notification noise. Decide delivery
semantics and unsubscribe/preferences before choosing a provider.

Relevant areas: read state, priorities, product-mode user preferences, and a
new delivery integration.

## 3. Make the public demo intentional

Add a quiet demo banner, define a reseed cadence, and establish a real
feature-flag/lab policy. The flash-experiments route is already demo-only; the
remaining work is communicating the sandbox and keeping in-progress work out
of the product experience.

Relevant areas: `src/lib/demoMode.ts`, app chrome, seed/deploy notes, and the
flash-experiment route.

## 4. Validate the deployed product experience

Add external error reporting in addition to the existing structured Convex logs
and React `ErrorBoundary`. Run deployed browser and accessibility QA across the
demo and Clerk-gated product flows, including invite activation, onboarding,
keyboard/focus paths, narrow layouts, and failure states.

Relevant areas: deployment configuration, `src/components/ErrorBoundary.tsx`,
auth gates, admin/invite routes, and the public app routes.

## 5. Add external agent and integration connectors only after the loop works

The shared connector boundary now covers org-scoped principals, auth,
idempotency, audit, task claiming, and agent-authored result replies. The runner
is still an internal simulated AI flow. Add real coding-agent and inbound source
adapters such as GitHub or deploy events without bypassing that boundary.

Relevant areas: `convex/agentTasks.ts`, `convex/replies.ts`, agent task UI, and
`convex/connectors.ts`, `convex/http.ts`, and provider-specific adapters.

## 6. Future milestone: true multi-organization product flow

The schema and access paths are org-scoped, but the app still resolves one
hard-coded default org. Do not treat this as a small UI switcher task: it needs
org creation, membership/resolution, routing, and an `orgId` migration from
optional to required. The active gap list is
[`organizations.md`](organizations.md).

## Already resolved

Spaces are durable post threads, composer surfaces are consolidated, flash-lab
pruning is complete, and agent tasks are persisted. Do not reopen those as
active cleanup work. README and live-doc synchronization were completed in this
cleanup; keep them current when implementation changes.
