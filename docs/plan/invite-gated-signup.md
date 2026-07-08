# Invite-gated sign-up + profile setup

Goal: you cannot use postwork without redeeming an invite. After activation you
complete your profile in a blocking modal (name + avatar + job title). Title is
a job title, not a role, and is admin-managed after onboarding.

Product decisions (already made — do not relitigate):

1. **Avatar**: initials + color remain the fallback. Add real image upload
   (Convex file storage) AND auto-import the profile photo from the login
   provider (Clerk). AMENDMENT (2026-07-08): the provider photo is imported
   and shown by default; the user can remove it, and once removed the avatar
   falls back to the current initials + color. See "Avatar amendment" below.
2. **Title**: stays a free-form *job title* (e.g. "design lead"). The UI must
   make clear it is not a permission level (that's `role`, already shown as a
   tag). Users set it once during onboarding; afterwards only admins can edit
   it. `updateProfile` (self-serve) loses the title field.
3. **Existing accounts are grandfathered**: anyone already in the DB is
   treated as active. No lockout, no wipe.
4. **Profile setup is blocking**: after activation you must save the profile
   modal before entering the app. Name is prefilled from the auth provider, so
   when the provider name came through, "save" is one click away immediately.

Current-state facts the implementers need:

- `convex/authUsers.ts` → `ensureViewerUser` auto-creates a user row for any
  Clerk identity; invites are never enforced. `nameFromIdentity` falls back
  name → nickname → preferredUsername → email → "member" (add
  `givenName + familyName` before email — this is why users get named
  "member" when the Clerk JWT lacks `name`; also check the Clerk dashboard
  JWT template includes `name`).
- `convex/access.ts` has `checkInvite` (public), `redeemInvite` (authed, only
  increments `usedCount` — no gating effect), `requestAccess`.
- `src/routes/gates.tsx` → `RequireAuth`/`ProductAuthGate` gate `/app` and
  `/admin`; `AccessOnboarding` is the invite-check + request-access form on
  the sign-in screen. `/join/$code` (`src/routes/JoinPage.tsx`) validates a
  code and tells signed-out users to come back after signing in.
- `src/lib/session.tsx` → `ProductSessionProvider` calls `users.ensureViewer`
  and reads `users.viewer` / `users.list`.
- `src/components/ProductProfileCard.tsx` (bottom-left sidebar) has the
  inline edit form (name/title/initials) to be replaced by a modal.
- Avatars are initials + `avatarColor` only (`src/components/Avatar.tsx`).
- Demo mode (`isDemo`) bypasses auth entirely and must stay bypassed for all
  of this. Seed personas have no `tokenIdentifier`.
- Read `convex/_generated/ai/guidelines.md` before touching `convex/`.

---

## Pinned API contract

Workstreams B and C code against this contract; workstream A implements it
exactly. Do not drift without updating this section.

Schema (`users` table) — all optional so no migration is needed; `undefined`
means grandfathered/active (decision 3):

```ts
status: v.optional(v.union(v.literal("pending"), v.literal("active"))),
profileCompletedAt: v.optional(v.number()),
avatarStorageId: v.optional(v.id("_storage")),
avatarUrl: v.optional(v.string()),
```

Semantics:
- `status === "pending"` → signed up, invite not redeemed. `undefined` or
  `"active"` → full member.
- `profileCompletedAt === undefined` **and** `tokenIdentifier` set → the
  blocking profile modal shows. (Seed personas have no `tokenIdentifier`, so
  they are unaffected. Existing real accounts hit the modal exactly once —
  intended: it fixes their "member" name.)
- `avatarUrl` is written once at upload time from `ctx.storage.getUrl(id)`
  (Convex storage URLs are stable). Storing it avoids making every user
  projection async across ~9 files. Deliberate derive-vs-store tradeoff.

Convex functions:

- `users.me` — query, args `{}`. Returns `null` when signed out, else
  `{ user: PublicUser | null, status: "pending" | "active",
  needsProfileSetup: boolean }`. Must return data for pending users (the
  gate depends on it). `user` is `null` when the row doesn't exist yet.
- `users.completeProfile` — mutation
  `{ name: string, title: string, initials: string, avatarStorageId?: Id<"_storage"> }`.
  Validates with existing `profile*Schema`s, patches the row, sets
  `profileCompletedAt`, resolves + stores `avatarUrl` if a storage id was
  given. Callable by pending-profile users (uses `ensureViewerUser`, not the
  active-only variant).
- `users.updateProfile` — mutation, **title removed**:
  `{ name: string, initials: string, avatarStorageId?: Id<"_storage"> | null }`
  (`null` clears the avatar back to initials). Keeps rate limit.
- `users.generateAvatarUploadUrl` — mutation `{}` → `string`
  (`ctx.storage.generateUploadUrl()`), rate-limited like `updateProfile`.
- `access.redeemInvite` — additionally patches the viewer to
  `status: "active"`. Stays the only path from pending to active.
- `admin.setTitle` — mutation `{ userId: Id<"users">, title: string }`,
  admin-only, audit-logged (`user.titleChanged`).

Frontend shared component (owned by workstream B, consumed by C):

```tsx
// src/components/ProfileDialog.tsx
export function ProfileDialog(props: {
  mode: "onboarding" | "edit";   // onboarding: blocking, includes job title
  open: boolean;
  onClose: () => void;           // ignored/hidden while onboarding
}): JSX.Element;
```

localStorage key for carrying an invite code through sign-in:
`postwork.inviteCode`.

---

## Avatar amendment (2026-07-08) — provider photo import + removal

Extends the pinned contract. The provider photo is imported and shown by
default; users can remove it (→ initials) and re-enable it.

Extra schema fields on `users`:

```ts
providerAvatarUrl: v.optional(v.string()), // last-seen Clerk identity.pictureUrl (or synced imageUrl)
avatarRemoved: v.optional(v.boolean()),    // user explicitly removed their photo → show initials
```

Effective render URL is stored in `avatarUrl` with this precedence:
1. uploaded image (`avatarStorageId`) → its storage URL, always wins;
2. else provider photo (`providerAvatarUrl`) **unless** `avatarRemoved === true`;
3. else `undefined` → Avatar renders initials + color.

Shared avatar-action validator (workstream A owns; B sends it):

```ts
// undefined = leave avatar unchanged
avatar: v.optional(v.union(
  v.object({ type: v.literal("upload"), storageId: v.id("_storage") }),
  v.object({ type: v.literal("remove") }),
  v.object({ type: v.literal("useProvider") }),
))
```

Action semantics (A implements a shared `applyAvatarAction` helper):
- `upload`  → `avatarStorageId = storageId`, `avatarRemoved = false`,
  `avatarUrl = await ctx.storage.getUrl(storageId)`.
- `remove`  → `avatarStorageId = undefined`, `avatarRemoved = true`,
  `avatarUrl = undefined`.
- `useProvider` → `avatarStorageId = undefined`, `avatarRemoved = false`,
  `avatarUrl = user.providerAvatarUrl`.

`ensureViewerUser`: capture `identity.pictureUrl` into `providerAvatarUrl` on
create and keep it fresh on sync; recompute `avatarUrl` from precedence but
**never resurrect a removed photo** (respect `avatarRemoved`).

Because the Clerk JWT template may omit the `picture` claim (same caveat as
`name`), the frontend also syncs it: `users.syncViewerProfile` gains an
optional `providerAvatarUrl` arg, and `ProductSessionProvider` passes Clerk
`user.imageUrl`. This guarantees the pfp works without a JWT-template change.

`completeProfile` / `updateProfile` both accept the `avatar` action above.
`ProfileDialog` shows a preview that reflects upload/remove/useProvider and a
"use login photo" affordance when `providerAvatarUrl` exists and isn't shown.

---

## Workstream A — backend enforcement (convex/ only)

Owns: `convex/schema.ts`, `convex/authUsers.ts`, `convex/users.ts`,
`convex/access.ts`, `convex/admin.ts`, plus the enforcement sweep below.
Touches nothing in `src/`.

1. Schema fields per the contract.
2. `authUsers.ts`:
   - `nameFromIdentity`: insert `givenName + familyName` fallback before
     `email`.
   - `ensureViewerUser`: newly created rows get `status: "pending"`.
   - New `ensureActiveViewerUser(ctx, options?)`: wraps `ensureViewerUser`,
     throws `ConvexError({ code: "PENDING_ACTIVATION", ... })` when
     `status === "pending"`.
   - `resolveViewerForRead` and `getViewerFromAuth`-based org-content reads:
     treat a pending viewer as `null` (pending users must not read org
     content). `users.me` is the one query that returns their own row.
3. Enforcement sweep — swap `ensureViewerUser` → `ensureActiveViewerUser` in
   every content write path: `posts.ts`, `replies.ts`, `reads.ts`,
   `spaces.ts`, `discussions.ts`, `attachments.ts`, `agentTasks.ts` (grep to
   be exhaustive). Exceptions that must keep working for pending users:
   `access.redeemInvite`, `users.ensureViewer`, `users.me`,
   `users.completeProfile`, `users.generateAvatarUploadUrl`. Admin functions
   already require admin (admins are active by definition).
4. `users.ts`: implement `me`, `completeProfile`, `generateAvatarUploadUrl`;
   strip title from `updateProfile`; support avatar set/clear + `avatarUrl`
   resolution.
5. `access.ts`: `redeemInvite` activates the viewer.
6. `admin.ts`: `setTitle` with audit log.
7. Verify: `bunx convex dev --once` (codegen) + `bun run typecheck`. Note:
   `src/` will have type errors until B/C land (`updateProfile` signature
   change in `ProductProfileCard`) — typecheck `convex/` compiles via the app
   program, so expect and report exactly which `src/` errors remain for the
   integrator; do not fix `src/` files yourself.

## Workstream B — onboarding flow (gates + activation + ProfileDialog)

Owns: `src/routes/gates.tsx`, `src/routes/JoinPage.tsx`,
`src/components/ProfileDialog.tsx` (new), `src/lib/session.tsx` (only if
needed to expose `users.me`). Codes against the pinned contract (the
`api.users.me` etc. types may not exist yet if run before A finishes — write
to the contract and let the integrator reconcile).

1. `ProductAuthGate` becomes a three-step gate (demo mode: unchanged
   passthrough):
   - signed out → existing `SignInScreen`;
   - signed in + `me.status === "pending"` → new full-screen
     `ActivationScreen`: invite code input (mono), validates via
     `access.checkInvite`, redeems via `access.redeemInvite`, prefills from
     `localStorage["postwork.inviteCode"]` (and clears it after redeem).
     Include the request-access escape hatch (reuse `AccessOnboarding`'s
     request form or link to `/`). Lowercase chrome, matches SignInScreen
     styling.
   - active + `me.needsProfileSetup` → `<ProfileDialog mode="onboarding" open />`
     rendered over a dimmed app-colored backdrop — blocking: no cancel, no
     escape-to-dismiss (see `src/components/Dialog.tsx` for the dialog
     primitive; onboarding mode must suppress its close paths).
2. `ProfileDialog` (new, shared): built on the existing `Dialog` component,
   centered modal (not a sidebar inline form).
   - Fields: name (text, prefilled from current user — provider name lands
     here, so a clean prefill means save is immediately enabled, decision 4);
     initials (auto-derived from name, editable, 2 chars); avatar (preview
     circle showing image or initials/color; "upload image" file input,
     `image/*`, client-side ≤ 5 MB check; "remove" resets to initials);
     **job title** — onboarding mode only — labeled "job title" with helper
     text: "what you do, not what you can do — admins manage permissions".
   - Save: onboarding → `users.completeProfile`; edit → `users.updateProfile`
     (no title). Upload flow: `generateAvatarUploadUrl` → `fetch(url,
     { method: "POST", body: file })` → returned `storageId` into the save
     mutation.
3. `JoinPage`: signed-out visitors with a valid code → write the code to
   `localStorage["postwork.inviteCode"]` before pointing them at sign-in;
   signed-in pending users → redeem inline (already close to this).
4. Do not modify `Avatar.tsx`, `ProductProfileCard.tsx`, or admin pages
   (workstream C owns those).

## Workstream C — profile surfaces (avatar rendering + card + admin)

Owns: `src/components/Avatar.tsx`, `src/components/ProductProfileCard.tsx`,
`src/routes/admin/AdminUsersPage.tsx`. Imports `ProfileDialog` from
`../components/ProfileDialog` per the pinned props contract (it may not exist
yet if run in parallel with B — import it anyway; the integrator reconciles).

1. `Avatar.tsx`: when `user.avatarUrl` is set, render the image (rounded,
   object-cover, same size API, `title={user.name}`); otherwise the existing
   initials/color circle. Update the `Pick<...>` prop type to include
   `avatarUrl`.
2. `ProductProfileCard.tsx`: delete the inline edit form; "edit profile"
   opens `<ProfileDialog mode="edit" ... />`. Display title read-only under
   the name labeled as job title; remove title/initials drafts and the
   `updateProfile` call (the dialog owns saving now).
3. `AdminUsersPage.tsx` user sheet: add an editable "job title" field (admin
   edits call `admin.setTitle`), following the sheet's existing action/error
   patterns.
4. Do not touch `gates.tsx`, `JoinPage.tsx`, or anything in `convex/`.

## Integration pass (orchestrator, after A + B + C return)

Subagents do **not** commit. The orchestrator:

1. Runs `bunx convex dev --once`, then `bun run build`; reconciles any
   contract drift between the three streams (most likely: `users.me` return
   shape, `ProfileDialog` props).
2. Manual QA checklist:
   - fresh Clerk account → blocked at activation; wrong code rejected; valid
     code activates (single-use invite increments/exhausts);
   - blocking profile modal appears, name prefilled, one-click save when the
     provider name is present; job title labeled clearly;
   - after save → app loads; profile card shows modal on "edit profile";
     title not editable there; admin sheet can edit title;
   - avatar upload shows up in feed/replies/admin (Avatar renders image);
   - `/join/$code` signed-out → code survives sign-in into the activation
     prefill;
   - pending user cannot write via crafted calls (spot-check one mutation);
   - demo mode (persona switcher, no Clerk) completely unaffected;
   - existing grandfathered account skips activation but gets the profile
     modal once.
3. Single commit on `beta`, push after user confirmation.

Out of scope: Clerk dashboard JWT template fix (manual — add the `name`
claim), org creation (see `docs/organizations.md`), email notifications for
access requests.
