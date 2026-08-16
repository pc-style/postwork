# Security & tenancy model

How Postwork isolates organizations, authorizes actions, and behaves in
production. This is the reference for contributors and the answer sheet for
security reviews. Statements here are enforced in code and covered by the
convex test suites (`convex/*.test.ts`).

## Identity and membership

- Identity comes from Clerk (JWT). `users.tokenIdentifier` maps an identity to
  one canonical user document, resolved globally — never per org.
- **`orgMemberships` is the authorization source of truth.** One account can
  hold memberships in many organizations, each with its own role
  (`admin | tester | member`), status (`pending | active`), and
  per-org deactivation. Legacy `users.role/status/deactivatedAt` fields are a
  compatibility mirror for the deployed client and are only trusted when no
  membership row exists (`getOrgMembership` fallback).
- All role/status/deactivation changes flow through `upsertOrgMembership`,
  which writes the membership row and mirrors legacy fields when the target
  org is the user's home org. Moderating a member in org B never touches
  their standing in org A (regression-tested).
- An org can never demote or lose its last admin (`countAdmins` guard).

## Authorization rules

- Every write mutation resolves its target org and asserts an active,
  non-deactivated membership there (`ensureActiveOrgViewer` /
  `requireOrgMembership`). Object-level gates (`post.orgId`, `space.orgId`,
  `att.orgId`) additionally pin rows to the tenant.
- Admin gates (`admin.ts`, `connectors.ts`, `viewerIsAdmin`, internal
  `adminTokenIdentifier` re-verification) read the membership row, never
  legacy fields.
- Spaces: `public` spaces are readable and writable by any active org member;
  `private` spaces require space membership (org admins excepted). Archived
  spaces are read-only. Managers (space role) and org admins govern
  membership and lifecycle. All governance actions are audit-logged.
- Reads go through `resolveReadScope` → `canAccessPost` → `canAccessSpace`,
  which enforce org membership and space visibility per row.

## Tenant data isolation

- Every tenant-owned table carries `orgId` and is queried through
  org-prefixed indexes. `migrations.auditTenantOwnership` scans for missing
  or cross-org ownership.
- `publicUser` strips `tokenIdentifier`, `subject`, and `email` before any
  user document reaches a client. Member email addresses exist server-side
  only for outbound delivery.
- The workspace export (`exports.exportChunk`) is admin-gated per membership,
  org-scoped per index, and reuses `publicUser` stripping.

## Abuse resistance

- Per-user rate limits (token buckets / fixed windows) on posting, replies,
  uploads, AI calls, profile edits, and all org/space governance writes
  (`convex/lib/rateLimit.ts`).
- Input validation limits title/body/attachment sizes and counts
  (`convex/lib/validation.ts`).

## External surfaces

- **GitHub webhooks** (`/api/connectors/github`): HMAC signature verification
  against an AES-GCM-encrypted per-connector secret (versioned keyring),
  bounded request bodies, idempotent event receipts.
- **Bearer connectors** (`/api/connectors/x`, agent-task claim): credential id
  + hashed secret; raw secrets are never stored.
- **Link previews**: server-side fetches refuse private/link-local hosts
  (IPv4 + IPv6), credentials in URLs, and non-http(s) schemes; redirects are
  re-validated hop by hop; responses are size- and time-bounded.
- **X Pulse / X sync**: read-only polling of a public proxy; normalized
  metrics only, no raw provider payloads stored.
- **Attachments**: upload tickets bind a storage id to the uploader before a
  post can claim it; serving URLs are only issued after `canAccessPost`.

## Outbound email

- Composition (`notificationComposer`) is pure and preference-gated; the
  provider boundary (`notificationDelivery.dispatch`) re-validates candidates
  (unread-only, size caps, teaser length) before Resend.
- Every send is idempotent: a claim table keyed without recipient PII plus
  Resend idempotency headers. Demo deployments never email anyone.
- Invite delivery reuses the same claim table (one send per invite) and
  builds join links only on the configured `POSTWORK_APP_URL` origin.

## Auditability

- `auditLog` records org lifecycle (create/rename/slug), invites
  (created/revoked/redeemed), access requests, space governance, and member
  moderation (role changes, deactivation, reactivation), scoped per org and
  visible to org admins at `/admin/audit-log`. Metadata is JSON with no
  secrets or member emails.

## Known gaps (tracked, not hidden)

- Org-scoped URLs: the client is switch-based today (one active workspace per
  session); simultaneous multi-workspace URLs are designed for
  (`resolveReadScope(requestedOrgId)`, `orgs.getContext`) but not shipped.
- SSO (SAML/OIDC beyond Clerk's defaults) and SCIM provisioning are not
  implemented.
- Link-preview fetching cannot defend against DNS rebinding from inside the
  Convex runtime; the hostname filter is best-effort.
- The X proxy search endpoint is unavailable, so X mentions are not ingested.
