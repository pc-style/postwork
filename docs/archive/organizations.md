# Organizations (multi-tenancy)

Status note for future work: people should eventually be able to create their
own orgs. This documents how far the current schema already gets us and what is
actually missing.

## Where we are today: single hard-coded org

The schema is already org-scoped, but the product is single-tenant in practice:

- `convex/schema.ts` has an `orgs` table (`name`, `slug`, `createdAt`,
  `by_slug` index) and every other table carries `orgId: v.optional(v.id("orgs"))`
  with org-prefixed indexes (`by_org_id_and_*`), including the search indexes
  (`filterFields: ["orgId", ...]`).
- `convex/authUsers.ts` pins everything to one default org:
  `DEFAULT_ORG_SLUG = "postwork-demo"`, resolved via `getDefaultOrgId` /
  `ensureDefaultOrg`. Every signup, seed row, invite, access request, and audit
  entry lands in that org.
- Invites (`convex/access.ts`) and the admin panel (`convex/admin.ts`) are
  org-scoped in the data model, but there is no way to target any org other
  than the default one.

So the schema supports orgs structurally; the product flow does not.

## What multi-org actually needs (gap list)

1. **Org creation flow** — a signed-up user with no org creates one (name →
   slug), becomes its first admin. Today `getDefaultOrgId` throws if the
   default org is missing; there is no create path.
2. **Org resolution instead of the default-org constant** — every callsite of
   `getDefaultOrgId` / `ensureDefaultOrg` must resolve the org from the
   authenticated user (or an explicit org context) instead of the hard-coded
   slug. This is the main refactor.
3. **`orgId` becomes required** — it is `v.optional(...)` only for legacy rows.
   Backfill existing rows to the default org, then narrow the validators
   (widen → migrate → narrow).
4. **User ↔ org membership model** — today a user row belongs to exactly one
   org (`users.orgId`). Decide: keep 1 user-row-per-org (simplest, Slack-like;
   the same Clerk identity gets a separate user row per org) or add an
   `orgMemberships` table. The current auth mapping
   (`by_org_id_and_token_identifier`) already assumes the former.
5. **Invites carry the org** — `/join/$code` already resolves an invite by
   code; the invite row's `orgId` determines which org you join. This mostly
   works already once redemption stops assuming the default org.
6. **Org switcher / routing** — either org-scoped URLs (`/o/$orgSlug/app/...`)
   or a session-selected org. Not needed until a user can be in two orgs.
7. **Seed + demo mode** — demo mode keeps the seeded `postwork-demo` org as-is;
   org creation is a product-mode (Clerk) feature.

## Non-goals for now

No billing, no org-level settings/branding, no cross-org anything. First
milestone is just: sign up → create org → invite people into *your* org.

## Implemented shared-deployment topology

The fixed tenant slugs are `postwork-demo` for anonymous read-only demo data and `postwork` (display name `Postwork`) for Clerk-authenticated product data. Both use the same schema and deployment; there are no parallel `demo_*` tables. Scope is selected from authentication on the backend, never from a global demo environment flag.

Migration order is: ensure the product org, audit missing ownership and cross-org references, activate the specified first product admin only if no active product admin exists, then release product traffic. Demo reseeding preserves the demo org ID and deletes only demo-owned rows. Frontends share `VITE_CONVEX_URL`; demo sets demo UI mode, while product sets Clerk configuration and product UI mode. Convex deployment has one explicit backend release owner, separate from frontend Vercel builds.
