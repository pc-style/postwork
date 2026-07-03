# Postwork Cleanup Plan — Agent Handoff

**Generated:** 2026-07-03. The audit ran against commit `2d60cc3`; the hardening changes described in Part 0 are committed as `16d70ab`.
**How this was produced:** one interactive hardening pass over the Convex backend, then a multi-agent audit (5 parallel auditors — design tokens, components, state architecture, routes/accessibility, docs/repo hygiene — with an adversarial verifier re-checking every falsifiable claim against the actual files). **38 findings survived verification, 0 were refuted.** Every quoted "Audit finding" block below is confirmed against the code unless marked *partial*.

## Ground rules for the executing agent

1. **Read [CLAUDE.md](CLAUDE.md) first**, and read `convex/_generated/ai/guidelines.md` before touching anything under `convex/` — it overrides trained Convex knowledge.
2. **Setup:** `bun install`, then `bun run typecheck` (`tsc -b --noEmit`) must pass before and after every step. There is no test suite; typecheck + the per-step **Verify** commands are the safety net. `bun run dev` needs a configured Convex deployment (`npx convex dev`) — don't assume you can run the app.
3. **Work one step at a time, one commit per step.** Steps within a phase are independent unless a dependency is called out. Phases are ordered by leverage: do Phase 1 first, and do Phase 2 (primitives) **before** Phase 3 (token sweep) — the primitives absorb dozens of call sites the sweep would otherwise have to touch twice.
4. **Line numbers are a snapshot.** They were verified on 2026-07-03 but will drift as you edit. Re-locate with grep before editing; never blind-edit by line number.
5. **Do not deploy, push, or publish anything** unless the repo owner asks. Local commits only.
6. **Design authority:** [DESIGN.md](DESIGN.md) is the spec ("The Kept Record": calm, durable, single wine accent, sentence case, one primary action per view). Where DESIGN.md contradicts the shipped code, Phase 7 says which side wins — for everything else, the spec wins.
7. Tick the checkboxes in this file as you complete steps, and delete this file when everything is done.

## Progress checklist

- [x] 0.1 Commit the hardening changes (done — `16d70ab`)
- [ ] 1.1 Add radius tokens to the theme
- [ ] 1.2 Replace `text-red-300` with the urgent token
- [ ] 1.3 Global `:focus-visible` + select focus styles
- [ ] 1.4 Resolve tracked-uppercase labels
- [ ] 1.5 Fix "home" nav active state
- [ ] 1.6 Make the "+ new post" CTA actually start a post
- [ ] 2.1 Extract `Button` component
- [ ] 2.2 Extract `Chip` primitive (+ `PostMetaChips`)
- [ ] 2.3 Extract `Dialog` shell + `PostForm`
- [ ] 2.4 Unify popover dismiss behavior (+ UserSwitcher keyboard/direction)
- [ ] 2.5 Dedupe `OrgSquare`
- [ ] 2.6 Dedupe the wine-framed agent-panel scaffold
- [ ] 3.1 Color-token sweep: kill the 272 `[var(--color-*)]` arbitrary classes
- [ ] 3.2 Tokenize the type ramp
- [ ] 3.3 One shared avatar/identity palette
- [ ] 4.1 Shared page-header/back-link scaffold
- [ ] 4.2 Consistent loading/empty states
- [ ] 4.3 Per-route document titles
- [ ] 5.1 Restructure the overlay store (memoized context, module-level hooks)
- [ ] 5.2 Single `Priority` type, typed search params
- [ ] 5.3 Honest local-id handling
- [ ] 5.4 Flatten/document the provider pyramid
- [ ] 5.5 Fix graduated flash experiments (incl. double-composer bug)
- [ ] 5.6 Reuse thread components in `ExperimentDiscussion`
- [ ] 5.7 Derive `ExperimentSlot` from `ExperimentSlots`
- [ ] 6.1 Decide: dead Group-B backend (convex/spaces.ts + 3 tables)
- [ ] 6.2 Decide: dead `agentTasks` table
- [ ] 6.3 Backend hardening follow-ups (subject leak, vote counting, codegen)
- [ ] 7.1 Reconcile DESIGN.md with the shipped shell
- [ ] 7.2 Purge the retired monospace aesthetic from AGENTS.md / PRODUCT.md
- [ ] 7.3 Refresh README
- [ ] 7.4 Regenerate OG images
- [ ] 7.5 Archive stale planning docs
- [ ] 7.6 Pin dependencies

---

## Part 0 — Already done in the previous session (do NOT redo)

These backend-hardening changes are already committed as `16d70ab` ("Harden demo backend: …"). **Step 0.1 is done** — just read that commit (`git show 16d70ab`) so you know the current backend shape before starting.

What was changed and why:

| File | Change |
|---|---|
| `convex/seed.ts` | `seed:run` was a **public** mutation that wipes every table — anyone with the deployment URL could erase the demo DB. Now `internalMutation` (CLI `convex run seed:run` still works). |
| `convex/users.ts` | `setProfileBySubject` accepted `subject` and `role` from the client — unauthenticated profile takeover + self-promotion to admin. Replaced with `updateProfile`: identity derived from `ctx.auth.getUserIdentity()`, `role` not editable. `users.list` now strips the `subject` field so visitors can't enumerate real members' auth identifiers. |
| `convex/reads.ts` (deleted), `posts.create`, `posts.counts` (removed) | Dead, unauthenticated public write/scan endpoints. The client's session overlay (`src/lib/store.tsx`) replaced them long ago; nothing in `src/` called them. `posts.ts` now carries a comment documenting the intentional absence of public write paths. |
| `convex/posts.ts` `feed` | Was `.collect()` (unbounded) with a per-post, per-viewer `postReads` lookup. Now `.take(200)` on both branches. |
| `convex/schema.ts` + `convex/spaces.ts` | `feedForSpace` filtered org-visibility posts on a field (`orgId`) that didn't exist in the schema — every `"org"`-scoped post was invisible to everyone. Added `posts.orgId: v.optional(v.id("orgs"))` and made the filter honest. |
| `src/lib/store.tsx` | Session-added participants are now deduped against backend participants (was: duplicate avatars + duplicate React keys after replying to a thread you were already in). |
| `convex/_generated/api.d.ts` | Hand-edited to drop the deleted `reads` module (codegen needs a configured deployment). Regenerate properly at the first opportunity — see step 6.3. |

---

## Phase 1 — Foundation quick wins (~1 hour total, all user-visible)

### Step 1.1 — Add radius tokens to the theme

The design system's smallest radius renders at **double the spec** because the theme never defines radius tokens.

> **Audit finding (confirmed · impact: high · effort: small) — rounded-sm renders 4px, not the spec's 2px — radius tokens never defined in the theme**
>
> DESIGN.md specifies rounded.sm = 2px (frontmatter line 50; prose: 'tags 2px' line 145, agent badge 'rounded-sm (2px). The smallest radius in the system' line 307-308). But the @theme block in src/index.css:3-28 defines no --radius-* tokens, so Tailwind v4's defaults apply and `rounded-sm` = 0.25rem = 4px. Every 'smallest radius' element therefore renders at double the spec: src/components/AgentTag.tsx:8, src/components/UserRoleTag.tsx:16, src/components/AgentSummary.tsx:45 (ai chip), src/components/AgentTasksPanel.tsx:67, src/components/SendAgentButton.tsx:48, src/components/RichText.tsx:10 (inline code), src/routes/AgentsPage.tsx:108, src/routes/SpacePage.tsx:182. Fix: add `--radius-sm: 2px;` to the @theme block in src/index.css (optionally also pin --radius-md: 6px and --radius-lg: 8px, which currently only coincidentally match the v4 defaults of 0.375rem/0.5rem). Alternative: swap those eight usages to `rounded-xs` (0.125rem = 2px), but tokenizing keeps the DESIGN.md name-to-utility mapping intact.
>
> _Files:_ `src/index.css`, `src/components/AgentTag.tsx`, `src/components/UserRoleTag.tsx`, `src/components/AgentSummary.tsx`, `src/components/AgentTasksPanel.tsx`, `src/components/SendAgentButton.tsx`, `src/components/RichText.tsx`, `src/routes/AgentsPage.tsx`, `src/routes/SpacePage.tsx`

**Do:** Add to the `@theme` block in `src/index.css`: `--radius-sm: 2px; --radius-md: 6px; --radius-lg: 8px;` (md/lg currently only coincidentally match Tailwind v4 defaults — pin them).
**Verify:** `bun run typecheck`; then confirm no component needed changing: the existing `rounded-sm` classes now resolve to 2px via the token.

### Step 1.2 — Replace `text-red-300` with the urgent token

> **Audit finding (confirmed · impact: medium · effort: small) — Urgent queue count uses Tailwind default text-red-300 instead of the --color-urgent token**
>
> src/components/AppShell.tsx:91 renders the sidebar urgent count with `text-red-300` (Tailwind's default palette red), while every other urgent-state surface uses the design token #ff6b6b: the Urgent priority chip/dot in src/lib/format.ts:29-30, the failed StatusChip in src/components/StatusChip.tsx:10, and the task error note in src/components/AgentTasksPanel.tsx:135. DESIGN.md scopes red-300 to inline error notes only (line 333) and names Urgent Coral #ff6b6b as the urgent state color (line 182). A count of urgent posts is priority state, not an error. Fix: change AppShell.tsx:91 to text-urgent (or text-[var(--color-urgent)] under the current idiom). (src/components/AgentSummary.tsx:71's red-300-on-red-500/10 error note is correct per spec and should stay.)
>
> _Files:_ `src/components/AppShell.tsx`, `src/lib/format.ts`

**Do:** In `src/components/AppShell.tsx`, change `text-red-300` → `text-urgent` (the `--color-urgent` token generates this utility).
**Verify:** `grep -rn "red-300" src/` returns nothing.

### Step 1.3 — Global `:focus-visible` + select focus styles

Two confirmed findings, one fix:

> **Audit finding (confirmed · impact: high · effort: small) — No :focus-visible treatment anywhere; selects remove outline with no replacement**
>
> grep finds zero `focus-visible` usages in src/, and src/index.css defines no focus rule. Text inputs at least pair `outline-none` with `focus:border-accent/50` (per DESIGN.md:314), but the three <select> elements do not: QuickPostBar.tsx:227, NewPostDialog.tsx:76, and SpacePage.tsx:225 all set `outline-none` with no focus: class, making keyboard focus completely invisible on them. Every button and link (FilterChip FeedPage.tsx:161-170, VoteButton FlashExperimentsPage.tsx:319-331, priority chips, nav links, UserSwitcher) falls back to the browser default blue focus ring, which clashes with the wine palette and violates DESIGN.md:331's 'standardize default · hover · focus · active · disabled' mandate. Fix: add a global rule in src/index.css — e.g. `:focus-visible { outline: 2px solid color-mix(in srgb, var(--color-accent) 50%, transparent); outline-offset: 2px; }` (or border-shift equivalents) — and add `focus:border-accent/50` to the three selects.
>
> _Files:_ `src/index.css`, `src/components/QuickPostBar.tsx`, `src/components/NewPostDialog.tsx`, `src/routes/SpacePage.tsx`

> **Audit finding (confirmed · impact: medium · effort: small) — Three select controls strip the focus outline without adding the spec'd focus border**
>
> DESIGN.md's input recipe (lines 312-315) says focus shifts the border to accent/50 with no ring; 16 text inputs implement this correctly as `outline-none focus:border-accent/50`. But three select elements apply `outline-none` with no focus style at all, making keyboard focus invisible: src/components/QuickPostBar.tsx:227 (space select), src/components/NewPostDialog.tsx:76 (space select), src/routes/SpacePage.tsx:225 (visibility select). Fix: append `focus:border-accent/50` to each (matching their sibling inputs on the same forms, e.g. NewPostDialog.tsx:60,67).
>
> _Files:_ `src/components/QuickPostBar.tsx`, `src/components/NewPostDialog.tsx`, `src/routes/SpacePage.tsx`

**Do:** Add a global rule to `src/index.css` (e.g. `:focus-visible { outline: 2px solid color-mix(in srgb, var(--color-accent) 55%, transparent); outline-offset: 2px; }`) and add `focus:border-accent/50` to the three `<select>`s (QuickPostBar, NewPostDialog, SpacePage).
**Verify:** `grep -rn "outline-none" src/ | grep -v focus` — every remaining hit must sit next to an explicit focus treatment or the global rule must cover it.

### Step 1.4 — Resolve tracked-uppercase labels

> **Audit finding (confirmed · impact: medium · effort: small) — Tracked-uppercase labels beyond the one sanctioned agent badge**
>
> DESIGN.md says labels use sentence case, never tracked all-caps (lines 223-224), names the agent badge 'the one sanctioned uppercase' (line 308), and its Don't list bans 'tracked all-caps eyebrow kickers' (line 370-371). Violations in app chrome: src/components/AppShell.tsx:80 ('your queue' header: text-[11px] tracking-wide uppercase), src/components/UserSwitcher.tsx:41 (section header: tracking-wide uppercase), src/routes/FlashExperimentsPage.tsx:108 (uppercase tracking-[0.2em] accent eyebrow — the exact banned pattern, on a real route not inside src/flashExperiments/) and :214 (uppercase tracking-wider meta row), and src/components/UserRoleTag.tsx:16 (role tag rendered uppercase+tracked, though DESIGN.md line 224 specifies role badges as sentence case: 'Owner'). Fix: drop `uppercase tracking-*` from these five sites and use sentence-case label styling (text-[11px] font-medium text-muted); keep uppercase only in src/components/AgentTag.tsx.
>
> _Files:_ `src/components/AppShell.tsx`, `src/components/UserSwitcher.tsx`, `src/components/UserRoleTag.tsx`, `src/routes/FlashExperimentsPage.tsx`

**Do:** Either lowercase the "your queue" / UserSwitcher / FlashExperimentsPage eyebrow labels (spec-compliant), **or** add a sanctioned "rail label" style to DESIGN.md §5 and keep them. Pick one and apply it everywhere — don't leave the split. If you keep uppercase anywhere, coordinate with step 7.1.
**Verify:** `grep -rn "uppercase" src/` — every hit is either the agent badge or the newly sanctioned style.

### Step 1.5 — Fix "home" nav active state

> **Audit finding (confirmed · impact: high · effort: small) — Sidebar 'home' nav link shows as active on every route**
>
> In /Users/m3/Developer/postwork/src/components/AppShell.tsx:21-23 and :34-42, the 'home' link's active state is computed solely from `!feedPriority` (location.search.priority), with no pathname check. On /spaces, /agents, /orgs, /posts/$postId, etc., search.priority is undefined, so 'home' receives the ACTIVE class simultaneously with the router-driven `[&.active]` highlight on the actual current page (AppShell.tsx:56) — two nav items lit at once everywhere except the priority feed. Fix: also select `s.location.pathname` in useRouterState and apply ACTIVE only when pathname === '/' (home: pathname==='/' && !priority; priority: pathname==='/' && priority==='urgent'), or use TanStack Link's activeProps with `activeOptions={{ exact: true, includeSearch: true }}` so all six nav items share one active mechanism instead of the current split (manual class for home/priority, `[&.active]` selector for ROUTE_NAV).
>
> _Files:_ `src/components/AppShell.tsx`

**Do:** Prefer the single-mechanism fix: use TanStack `Link` `activeProps`/`activeOptions={{ exact: true, includeSearch: true }}` for all six nav links, deleting the manual `ACTIVE` constant and the `useRouterState` priority selection.
**Verify:** typecheck; read the rendered logic — exactly one nav item can be active for `/`, `/?priority=urgent`, and each ROUTE_NAV path.

### Step 1.6 — Make the "+ new post" CTA actually start a post

> **Audit finding (confirmed · impact: high · effort: small) — '+ new post' primary CTA is a dead link — it only navigates to '/'**
>
> The shell's single primary action (AppShell.tsx:63-68) is a `<Link to="/">+ new post</Link>` with no onClick and no composer trigger. Clicking it from any page just navigates to the feed; the user must then separately discover the QuickPostBar peek at the bottom. Meanwhile NewPostDialog (src/components/NewPostDialog.tsx) is a fully built new-post modal that the main app never mounts — it is only imported by two flash experiments (src/flashExperiments/experiments/wide-review-shell.tsx:4, centered-rail.tsx:4). Fix: either (a) have the CTA open NewPostDialog via local state in AppShell, or (b) keep the navigation but pass intent (e.g. search param `compose: true` or shared context) that FeedPage uses to call QuickPostBar's reveal() and focus the textarea. Per DESIGN.md 'one primary action per view', the wine-filled button must actually start a post.
>
> _Files:_ `src/components/AppShell.tsx`, `src/components/NewPostDialog.tsx`, `src/components/QuickPostBar.tsx`

**Do:** Option (a) is cleaner given `NewPostDialog` already exists and is unused by the main app: hold `open` state in `AppShell`, render `NewPostDialog` there, and make the CTA a `<button>`. After step 2.3 the dialog will share the same `PostForm` as QuickPostBar. (Watch step 5.5's note: two flash experiments import `NewPostDialog` — keep it working for them or update the forks.)
**Verify:** typecheck; the CTA is a button (not a `Link to="/"`), and posting from it navigates to the new post.

---

## Phase 2 — Shared primitives (do before the token sweep)

### Step 2.1 — Extract `Button`

Two dimensions independently confirmed the same problem (14–15 inline recipes, radius drift against the spec):

> **Audit finding (confirmed · impact: high · effort: medium) — No Button component; 14 inline primary-button recipes with radius drift that violates DESIGN.md**
>
> DESIGN.md §5 'Buttons' specifies primary = rounded-lg (8px) wine fill, secondary/ghost = rounded-md. In code every button re-derives its classes inline: grep for 'bg-accent px' yields 14 hits across 12 files, and the primary recipe drifts between rounded-md (Composer.tsx:141 'reply', QuickPostBar.tsx:214 'post', AgentTasksPanel.tsx:97 'send agent', SpacesPage.tsx:81 'accept') and the spec's rounded-lg (NewPostDialog.tsx:116, WallPostDialog.tsx:107, WallPage.tsx:60, SpacePage.tsx:233, SpacesPage.tsx:101, AppShell.tsx:65, centered-rail.tsx:56, wide-review-shell.tsx:64) — only SpacePage.tsx:139's rounded-full 'invite org' pill is a sanctioned exception. Ghost/cancel buttons are likewise re-typed at each call site (Composer.tsx:133, NewPostDialog.tsx:109, WallPostDialog.tsx:100, QuickPostBar.tsx:258, SpacesPage.tsx:84, AgentSummary.tsx:56). Fix: add src/components/Button.tsx with variant ('primary'|'ghost'|'quiet'|'pill') and size props encoding the DESIGN.md recipe (including hover:bg-accent-soft and disabled:opacity-40), then replace the inline call sites; this both removes the duplication and forcibly reconciles the rounded-md primaries with the spec.
>
> _Files:_ `src/components/Composer.tsx`, `src/components/QuickPostBar.tsx`, `src/components/AgentTasksPanel.tsx`, `src/components/NewPostDialog.tsx`, `src/components/WallPostDialog.tsx`, `src/routes/SpacesPage.tsx`, `src/routes/SpacePage.tsx`, `src/routes/WallPage.tsx`, `src/components/AppShell.tsx`, `DESIGN.md`

> **Audit finding (confirmed · impact: medium · effort: medium) — Primary button recipe hand-rolled at 15 call sites with drifting radius, padding, and disabled treatment**
>
> DESIGN.md's button-primary recipe is rounded-lg (8px) with 6px 12px padding (frontmatter lines 60-65; prose lines 264-269). The bg-accent + hover:bg-accent-soft primary button is instead re-typed inline at ~15 sites with three radii and at least four padding combos: rounded-lg px-4 py-2 (src/components/NewPostDialog.tsx:116, src/components/WallPostDialog.tsx:107, src/routes/WallPage.tsx:60, src/routes/SpacePage.tsx:233, src/routes/SpacesPage.tsx:101), rounded-lg px-3 py-2 (src/components/AppShell.tsx:65), rounded-md px-3.5 py-1.5 (src/components/Composer.tsx:141), rounded-md px-3.5 py-2 (src/components/QuickPostBar.tsx:214, src/components/AgentTasksPanel.tsx:97), rounded-md px-3 py-1.5 text-xs (src/routes/SpacesPage.tsx:81) — the rounded-full instance at src/routes/SpacePage.tsx:139 is the spec-sanctioned 'invite org' pill and is fine. Disabled treatment also drifts: spec says opacity-40 + cursor-not-allowed, but only AgentTasksPanel.tsx:97 includes cursor-not-allowed, WallPage.tsx:60/AppShell.tsx:65/SpacePage.tsx:139 omit disabled styles entirely, and the ghost button in src/components/AgentSummary.tsx:56 uses disabled:opacity-50. Fix: extract src/components/Button.tsx with primary/ghost variants encoding the DESIGN.md recipes (primary: rounded-lg px-3 py-1.5 bg-accent hover:bg-accent-soft disabled:opacity-40 disabled:cursor-not-allowed; ghost: rounded-md border-accent/30 text-accent-soft hover:bg-accent/15) and migrate the call sites.
>
> _Files:_ `src/components/Composer.tsx`, `src/components/QuickPostBar.tsx`, `src/components/AgentTasksPanel.tsx`, `src/components/NewPostDialog.tsx`, `src/components/WallPostDialog.tsx`, `src/components/AppShell.tsx`, `src/components/AgentSummary.tsx`, `src/routes/SpacesPage.tsx`, `src/routes/SpacePage.tsx`, `src/routes/WallPage.tsx`

**Do:** Create `src/components/Button.tsx` with `variant: 'primary' | 'ghost' | 'quiet' | 'pill'` and optional `size`, encoding DESIGN.md's recipes once (primary: `rounded-lg bg-accent hover:bg-accent-soft disabled:opacity-40`, etc.). Migrate all listed call sites; the `rounded-md` primaries get reconciled to `rounded-lg` by construction. Leave SpacePage's `rounded-full` invite pill as the `pill` variant.
**Verify:** `grep -rn "bg-accent px" src/ | grep -v Button.tsx` returns nothing (or only flash-experiment forks slated for step 5.5).

### Step 2.2 — Extract `Chip` (+ `PostMetaChips`)

> **Audit finding (confirmed · impact: high · effort: medium) — Chip/tag markup proliferates as inline recipes instead of one Chip primitive**
>
> DESIGN.md §5 'Tags & Chips' defines a single chip family, but the codebase has three one-off chip components (src/components/StatusChip.tsx, AgentTag.tsx, UserRoleTag.tsx — 13-21 lines each) plus at least ten inline re-derivations of the same 'rounded-md/sm border px-1.5 py-0.5 text-[10px]/[11px]' recipe: pinned chip duplicated verbatim in PostCard.tsx:29-31 and PostPage.tsx:70-74; priority chip (dot + label from priorityStyles) duplicated in PostCard.tsx:33-38, PostPage.tsx:75-80, and SpacePage.tsx:163-166; space chip in PostCard.tsx:39-41, PostPage.tsx:81-83, and compact-cards.tsx:24-26; scope tag in SpacePage.tsx:173-175; role sub-badge in SpacePage.tsx:124-126; wall provenance chip in WallPage.tsx:79-83; experiment status/slot chips via statusStyles in FlashExperimentsPage.tsx:17-23 and 214-228; ImplementedBadge in FlashExperimentsPage.tsx:335-350. Fix: add src/components/Chip.tsx with props {tone: 'accent'|'urgent'|'high'|'neutral'|'muted', size, dot?, uppercase?} implementing the DESIGN.md recipe once; re-express StatusChip/AgentTag/UserRoleTag and the PostCard/PostPage/SpacePage inline chips as thin wrappers, and move the duplicated pinned/priority/space chip row into a shared PostMetaChips component used by both PostCard and PostPage.
>
> _Files:_ `src/components/StatusChip.tsx`, `src/components/AgentTag.tsx`, `src/components/UserRoleTag.tsx`, `src/components/PostCard.tsx`, `src/routes/PostPage.tsx`, `src/routes/SpacePage.tsx`, `src/routes/FlashExperimentsPage.tsx`, `src/lib/format.ts`

**Do:** As described in the finding: `src/components/Chip.tsx` (`tone`, `size`, `dot?`, `uppercase?`), re-express `StatusChip`/`AgentTag`/`UserRoleTag` as thin wrappers, and pull the duplicated pinned/priority/space chip row into a `PostMetaChips` component shared by `PostCard` and `PostPage`.
**Verify:** typecheck; `grep -rn "px-1.5 py-0.5" src/components src/routes` hits only `Chip.tsx`.

### Step 2.3 — Extract `Dialog` shell + `PostForm`

Two confirmed findings, one extraction:

> **Audit finding (confirmed · impact: high · effort: medium) — Post-creation form + dialog scaffold duplicated across five surfaces**
>
> The same create-post form (title input, body textarea, space select, priority pill row, busy 'posting…' submit, store.createPost + navigate) is re-implemented five times: src/components/NewPostDialog.tsx (whole file, 124 lines), src/components/WallPostDialog.tsx (whole file, 115 lines), src/components/QuickPostBar.tsx:189-263, src/routes/SpacePage.tsx:208-237 ('post to space' section), and src/flashExperiments/experiments/inline-bottom-composer.tsx:11-135. NewPostDialog and WallPostDialog are ~85% identical: byte-identical overlay scaffolding (NewPostDialog.tsx:37-43 vs WallPostDialog.tsx:45-51: 'fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-[8vh]' + max-w-2xl surface card), identical title-input and textarea class strings, identical priority pill loops (NewPostDialog.tsx:88-102 vs WallPostDialog.tsx:80-94), identical footer buttons; they differ only in heading text, the space select, wallOwnerId, and the title fallback. Neither dialog handles Escape or click-outside beyond the backdrop onClick, and neither traps focus. Fix: extract (1) a Dialog shell component (backdrop, panel, header/close, Escape handling) and (2) a PostForm component in src/components/ that takes {showSpace, defaultTitlePlaceholder, onSubmit(fields)}; NewPostDialog and WallPostDialog collapse to ~20-line configurations, and SpacePage's inline composer reuses PostForm with its extra visibility select passed as children.
>
> _Files:_ `src/components/NewPostDialog.tsx`, `src/components/WallPostDialog.tsx`, `src/components/QuickPostBar.tsx`, `src/routes/SpacePage.tsx`, `src/flashExperiments/experiments/inline-bottom-composer.tsx`

> **Audit finding (confirmed · impact: high · effort: medium) — Modal dialogs lack Escape, focus trap/return, and dialog semantics, and are near-duplicate code**
>
> NewPostDialog.tsx:36-123 and WallPostDialog.tsx:44-114 are ~90% identical (fixed inset-0 backdrop, click-outside close, title input, body textarea, priority row, cancel/post footer) but drift in details: close affordance is '✕' (NewPostDialog.tsx:51) vs the word 'close' (WallPostDialog.tsx:59), and WallPostDialog has no space picker. Neither has role="dialog"/aria-modal, neither closes on Escape, neither traps focus (Tab walks into the page behind the backdrop) nor returns focus to the trigger on close — while QuickPostBar does handle Escape (QuickPostBar.tsx:142-147), so the app's overlay keyboard behavior is inconsistent. Fix: extract one shared PostDialog (or a generic Dialog wrapper built on the native <dialog> element, which gives Escape, focus containment, and ::backdrop for free), parameterized by heading, space-picker visibility, and submit handler; standardize the close affordance to one treatment per DESIGN.md's 'one consistent vocabulary screen to screen'.
>
> _Files:_ `src/components/NewPostDialog.tsx`, `src/components/WallPostDialog.tsx`

**Do:** Build the shared `Dialog` on the native `<dialog>` element (free Escape, focus containment, `::backdrop`), restoring focus to the trigger on close; standardize one close affordance. Extract `PostForm` (title, body, optional space select, priority row, busy submit) and collapse `NewPostDialog`, `WallPostDialog`, and SpacePage's inline composer onto it. QuickPostBar keeps its own layout but should reuse `PostForm`'s field pieces where practical.
**Verify:** typecheck; Escape closes both dialogs; `grep -c "fixed inset-0 z-50" src/components` ≤ 1.

### Step 2.4 — Unify popover dismissal (+ UserSwitcher menu)

> **Audit finding (confirmed · impact: medium · effort: small) — Popover behavior implemented inconsistently: UserSwitcher hand-rolls outside-click dismiss, SendAgentButton has none**
>
> Two dropdown popovers exist with divergent scaffolding: src/components/UserSwitcher.tsx:13-20 registers its own document-level mousedown listener to close on outside click, while src/components/SendAgentButton.tsx:34-56 renders an absolutely-positioned agent menu (lines 42-54) that only closes when an item is picked or the trigger is re-clicked — no outside-click, no Escape, so an open 'send agent' menu lingers over reply threads. Neither handles Escape or focus return. Fix: extract a Popover primitive (trigger + panel, outside-click via one shared mousedown/focusout handler, Escape to close) in src/components/ and rebuild both UserSwitcher's teammate menu and SendAgentButton's agent list on it; this removes the duplicated positioning/z-index/surface classes ('absolute … z-10/20 … rounded-md/lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow') and makes dismissal behavior uniform.
>
> _Files:_ `src/components/UserSwitcher.tsx`, `src/components/SendAgentButton.tsx`

> **Audit finding (confirmed · impact: medium · effort: small) — UserSwitcher menu opens downward from a bottom-anchored button and has no keyboard support**
>
> AppShell places UserSwitcher at the bottom of a sticky full-height sidebar (AppShell.tsx:28 `md:h-[calc(100vh-3rem)]`, :70 `mt-auto`), but the menu positions itself below the trigger with `absolute right-0 z-20 mt-2 w-64` (UserSwitcher.tsx:40) — on md+ viewports the ~300px user list renders below the fold, mostly clipped offscreen. Fix: position it upward (`bottom-full mb-2 left-0`) or flip based on placement. Separately, the trigger button (UserSwitcher.tsx:26-37) has no aria-expanded/aria-haspopup, the menu has no role="menu"/listbox semantics, and it closes only on outside mousedown (UserSwitcher.tsx:13-20) — Escape does nothing, unlike QuickPostBar which handles Escape. Add aria-expanded={open}, aria-haspopup="menu", and an Escape keydown handler that closes and refocuses the trigger.
>
> _Files:_ `src/components/UserSwitcher.tsx`, `src/components/AppShell.tsx`

**Do:** One `usePopoverDismiss(ref, onClose)` hook (outside-click + Escape) used by both `UserSwitcher` and `SendAgentButton`; open the UserSwitcher menu upward from its bottom-anchored trigger; add basic keyboard support (Escape closes, arrow/tab reachable items).
**Verify:** typecheck; both popovers close on Escape and outside click.

### Step 2.5 — Dedupe `OrgSquare`

> **Audit finding (confirmed · impact: medium · effort: small) — OrgSquare component defined three separate times in route files**
>
> The org color-square (initials tile, a DESIGN.md-named part of the 'Org chip / member pill' recipe) is locally defined in three routes: src/routes/SpacePage.tsx:9-19, src/routes/SpacesPage.tsx:5-15, and src/routes/LinkedOrgsPage.tsx:4-14. The copies have already diverged slightly (SpacePage's adds shrink-0 and is the only one whose size prop is exercised; LinkedOrgsPage's takes no size prop). Fix: create src/components/OrgSquare.tsx with the SpacePage variant (shrink-0 + size prop, defaulting to size-6) and import it from all three routes, deleting the local definitions.
>
> _Files:_ `src/routes/SpacePage.tsx`, `src/routes/SpacesPage.tsx`, `src/routes/LinkedOrgsPage.tsx`

**Do:** One exported component in `src/components/`, delete the three route-local copies.
**Verify:** `grep -rn "function OrgSquare" src/` → exactly one hit.

### Step 2.6 — Dedupe the wine-framed agent panel scaffold

> **Audit finding (confirmed · impact: medium · effort: small) — Wine-framed 'agents/ai' panel scaffold duplicated three times, contradicting DESIGN.md's 'one surface' rule**
>
> The accent-framed panel recipe — 'rounded-lg border border-accent/25 bg-accent/[0.06] p-4' section with a header pairing a 'rounded-sm bg-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-accent-soft' label chip and a 'text-xs font-semibold tracking-wide text-accent-soft lowercase' title — is copy-pasted in src/components/AgentSummary.tsx:42-51 ('ai · agent summary'), src/components/AgentTasksPanel.tsx:65-73 ('agents · investigations'), and src/routes/AgentsPage.tsx:106-114 ('agents · control plane'; this copy drops to border-accent/25 with bg-accent/[0.06] too). DESIGN.md's 'Agent Summary' section calls this 'the one surface where the accent frames a whole block', but the code has three, each hand-rolled. Fix: extract an AccentPanel component ({chipLabel, title, action?, children}) in src/components/ and use it in all three sites; that also makes the DESIGN.md claim enforceable in one place if the panel treatment ever changes.
>
> _Files:_ `src/components/AgentSummary.tsx`, `src/components/AgentTasksPanel.tsx`, `src/routes/AgentsPage.tsx`, `DESIGN.md`

**Do:** Extract the shared accent-framed panel (accent border, background wash, label row) used by AgentSummary and friends into one component per DESIGN.md's "one surface" rule.
**Verify:** `grep -rn "border-accent/25" src/` hits only the shared component (plus Chip if applicable).

---

## Phase 3 — Token adoption sweep (mechanical; after Phase 2)

### Step 3.1 — Kill the 272 `[var(--color-*)]` arbitrary classes

> **Audit finding (confirmed · impact: high · effort: medium) — Split idiom for the same color tokens: 272 arbitrary [var(--color-*)] classes coexist with generated theme utilities**
>
> All colors are declared in @theme (src/index.css:5-17), so Tailwind v4 auto-generates `text-muted`, `text-faint`, `border-border`, `bg-surface`, `bg-surface-2`, `bg-bg`, `text-urgent`, `text-high`, etc. The codebase uses the generated utilities for half the palette (text-fg, text-accent-soft, bg-accent/10, border-accent/40 — 123 uses) but the arbitrary-value escape hatch for the other half: 272 occurrences of `[var(--color-*)]` in src/components and src/routes across 27 files — 108x [var(--color-muted)], 78x [var(--color-border)], 34x [var(--color-surface)], 26x [var(--color-bg)], plus surface-2/faint/urgent/high (e.g. src/components/PostCard.tsx:17,39,57; src/components/AppShell.tsx:33,79-101; src/lib/format.ts:29-40; src/components/StatusChip.tsx:5-10; src/components/Avatar.tsx:15,23). `text-muted` as a plain utility appears zero times. Fix: mechanical find/replace to the generated utilities (text-[var(--color-muted)] -> text-muted, border-[var(--color-border)] -> border-border, bg-[var(--color-surface)] -> bg-surface, bg-[var(--color-bg)] -> bg-bg, and the /NN opacity variants likewise, e.g. bg-[var(--color-urgent)]/10 -> bg-urgent/10) across src/components, src/routes, and src/lib/format.ts. This unifies the idiom with the accent/fg usage, shortens class strings, and makes token usage greppable.
>
> _Files:_ `src/index.css`, `src/lib/format.ts`, `src/components/PostCard.tsx`, `src/components/AppShell.tsx`, `src/components/StatusChip.tsx`, `src/components/Avatar.tsx`, `src/routes/SpacePage.tsx`, `src/routes/FeedPage.tsx`

**Do:** Mechanical rewrite across `src/` (components, routes, lib/format.ts, flashExperiments): `text-[var(--color-muted)]` → `text-muted`, `border-[var(--color-border)]` → `border-border`, `bg-[var(--color-surface)]` → `bg-surface`, `bg-[var(--color-bg)]` → `bg-bg`, `text-[var(--color-faint)]` → `text-faint`, and opacity forms like `bg-[var(--color-urgent)]/10` → `bg-urgent/10`. Do it with careful sed/replace-all, reviewing the diff — don't hand-edit 272 sites.
**Verify:** `grep -rn "var(--color-" src/ --include='*.tsx' --include='*.ts'` returns zero (index.css keeps the definitions); typecheck; spot-check a page visually if a dev server is available.

### Step 3.2 — Tokenize the type ramp

> **Audit finding (confirmed · impact: high · effort: medium) — Type ramp is not tokenized; 25x text-[11px], 4x text-[15px] hand-roll spec sizes, and 14 uses of 10px/9px exist outside the ramp entirely**
>
> DESIGN.md defines a five-step ramp (display 1.25rem, title 0.9375rem, body 0.875rem, label 0.6875rem, mono 0.8125rem — lines 17-48, 212-226), but @theme in src/index.css defines no --text-* tokens. Components re-derive the steps as pixel literals: text-[11px] (label) 25 times (e.g. src/components/PostCard.tsx:27, src/components/StatusChip.tsx:16, src/components/AppShell.tsx:80, src/routes/PostPage.tsx:69), text-[15px] (title) 4 times (src/components/PostCard.tsx:50, src/routes/PostPage.tsx:98, src/routes/SpacesPage.tsx:115, src/routes/SpacePage.tsx:177), text-[13px] (mono) in src/components/CodeBlock.tsx:49. Worse, 13 usages of text-[10px] (src/components/AgentTag.tsx:8, UserRoleTag.tsx:16, AgentSummary.tsx:45, AgentTasksPanel.tsx:67, src/routes/LinkedOrgsPage.tsx:8, SpacesPage.tsx:9,122, SpacePage.tsx:13,35,124, AgentsPage.tsx:108) and one text-[9px] (src/routes/SpacePage.tsx:182) are sizes that appear nowhere in DESIGN.md. Fix: add `--text-label: 0.6875rem` (with --text-label--line-height: 1.2), `--text-title: 0.9375rem` (1.3), `--text-code: 0.8125rem` to @theme; replace text-[11px]/text-[15px]/text-[13px] with text-label/text-title/text-code; then either promote a 10px 'badge' step into DESIGN.md or lift the 10px/9px usages onto the 11px label step.
>
> _Files:_ `src/index.css`, `src/components/PostCard.tsx`, `src/components/AgentTag.tsx`, `src/components/UserRoleTag.tsx`, `src/components/CodeBlock.tsx`, `src/routes/SpacePage.tsx`, `src/routes/SpacesPage.tsx`, `src/routes/PostPage.tsx`

**Do:** Add `--text-label: 0.6875rem` (+ `--text-label--line-height: 1.2`), `--text-title: 0.9375rem` (1.3), `--text-code: 0.8125rem` to `@theme`; replace `text-[11px]`→`text-label`, `text-[15px]`→`text-title`, `text-[13px]`→`text-code`. Then decide the 10px/9px strays: either promote a `--text-badge: 10px` step into DESIGN.md (coordinate with 7.1) or lift them to `text-label`. The 9px outlier in SpacePage should not survive either way.
**Verify:** `grep -rn "text-\[1[015]px\]\|text-\[9px\]" src/` returns zero.

### Step 3.3 — One shared identity palette

> **Audit finding (confirmed · impact: medium · effort: medium) — Three divergent avatar/org color palettes across backend and baked client data, including banned blue/violet hues**
>
> Identity colors are defined independently in three places with no shared constant: convex/seed.ts:40-49 (9 colors: #8c1862, #9d5cff, #b53a82, #d9a441, #2e7d52, #c75146, #4f6d8c, #6b5b8c, #3d7d76), convex/discussions.ts:21-28 AVATAR_PALETTE (6 colors: #8c1862, #b53a82, #2e7d52, #9a7d2e, #3a6ea5, #7d5ba6), and src/lib/spaces.tsx:85-88 org colors plus per-post authorColor literals at lines 134,148,162,176,190 and the #8a8782 placeholder at line 218. The sets only partially overlap: an auto-provisioned discussion user can get straight blue #3a6ea5 or purple #7d5ba6, and seed users include vivid violet #9d5cff — hues DESIGN.md explicitly bans reintroducing ('never reintroduce indigo, blue, or a second hue', lines 187-190, 359-360), and which contradict discussions.ts's own comment ('Kept muted so it never competes with the page's single wine accent', lines 19-20). Fix: create one shared palette module (e.g. convex/avatarPalette.ts imported by both convex/seed.ts and convex/discussions.ts, and imported into src/lib/spaces.tsx since client code can import from convex/), tuned to warm muted hues (drop #3a6ea5 and #9d5cff, keep the wine/teal/gold/moss family), and document it in DESIGN.md's color section.
>
> _Files:_ `convex/seed.ts`, `convex/discussions.ts`, `src/lib/spaces.tsx`, `DESIGN.md`

**Do:** Follow the finding's fix: a single palette module under `convex/` (importable from client code), warm muted hues only — drop `#3a6ea5` (blue) and `#9d5cff` (violet), which DESIGN.md bans. Update `convex/seed.ts`, `convex/discussions.ts`, and `src/lib/spaces.tsx` to import it. Note the seed only applies on reseed; existing deployed docs keep old colors until `seed:run` is re-run.
**Verify:** `grep -rn "#3a6ea5\|#9d5cff" convex/ src/` returns zero; each palette hex is defined in exactly one file.

---

## Phase 4 — Pages & UX consistency

### Step 4.1 — Shared page-header/back-link scaffold

> **Audit finding (confirmed · impact: medium · effort: medium) — Back-link + page-header scaffolding is copy-pasted across six pages and drifts**
>
> Every page hand-rolls the same '← back' link and header block with small divergences: PostPage.tsx:58-63, AgentsPage.tsx:91-103, SpacesPage.tsx:51-68, WallPage.tsx:38-43 all say '← feed' (gap-1); SpacePage.tsx:102-104 says '← Spaces' — capitalized, breaking the app's own lowercase register (DESIGN.md:229 Lowercase-Nav Rule) and using gap-1.5; LinkedOrgsPage.tsx:21-23 says '← spaces'. Page titles disagree with the type scale: AgentsPage.tsx:99 and FlashExperimentsPage.tsx:112 use text-2xl while SpacesPage.tsx:60, LinkedOrgsPage.tsx:26, SpacePage.tsx:110, WallPage.tsx:51 use text-xl — DESIGN.md:214 fixes the Display/Title tier at 1.25rem (text-xl). Fix: extract a shared PageHeader component (props: backTo, backLabel, title, description, action slot) in src/components/, normalize to text-xl and lowercase back labels, and replace the six hand-rolled blocks.
>
> _Files:_ `src/routes/PostPage.tsx`, `src/routes/AgentsPage.tsx`, `src/routes/SpacesPage.tsx`, `src/routes/SpacePage.tsx`, `src/routes/WallPage.tsx`, `src/routes/LinkedOrgsPage.tsx`, `src/routes/FlashExperimentsPage.tsx`

**Do:** One `PageHeader` (title, eyebrow/back-link slot, actions slot) used by the six pages listed in the finding.
**Verify:** `grep -rn "← back" src/routes` (or the actual back-link markup) hits only the shared component.

### Step 4.2 — Consistent loading/empty states

> **Audit finding (confirmed · impact: medium · effort: medium) — Loading/empty states are inconsistent per page, and SpacePage has no empty state at all**
>
> Loading text is 'Loading…' (capitalized, centered) in FeedPage.tsx:115-118 and PostPage.tsx:38-41 but 'loading…' lowercase in WallPage.tsx:68-70 and AppShell.tsx:97. Empty states use four different recipes: dashed-border card (FeedPage.tsx:120-126), dashed border + surface fill + p-8 (WallPage.tsx:72-74), an accent-tinted 'control plane' panel (AgentsPage.tsx:105-119), and a plain text span (LinkedOrgsPage.tsx:58). SpacePage.tsx:149-206 maps posts with no length check — a space with zero posts (e.g. one just created via SpacesPage's create form) renders an empty gap between the header and the 'post to space' composer. FlashExperimentsPage.tsx:142-145 contains a dead empty-state branch: `items.length === 0` already returns null at line 127, so the 'nothing here yet.' card is unreachable. Fix: add shared LoadingState and EmptyState components (dashed hairline card, muted lowercase text to match the app register), use them on all five pages, give SpacePage an empty branch, and delete the unreachable branch in FlashExperimentsPage.
>
> _Files:_ `src/routes/FeedPage.tsx`, `src/routes/PostPage.tsx`, `src/routes/WallPage.tsx`, `src/routes/SpacePage.tsx`, `src/routes/AgentsPage.tsx`, `src/routes/LinkedOrgsPage.tsx`, `src/routes/FlashExperimentsPage.tsx`

**Do:** Small `LoadingState`/`EmptyState` components with one visual treatment; give SpacePage the empty state it's missing; replace the per-page ad-hoc variants.
**Verify:** every route component renders one of the shared states for its `undefined` (loading) and empty-array cases.

### Step 4.3 — Per-route document titles *(verifier verdict: partial — directionally confirmed, details slightly overstated; re-check before starting)*

> **Audit finding (partial · impact: medium · effort: small) — No per-route document titles — every page shows the static index.html title**
>
> index.html:11 sets 'Postwork — async team communication' and nothing under src/ ever writes document.title, so post detail pages, spaces, walls, agents, and the flash-experiments lab are all indistinguishable in browser tabs and history — at odds with the 'Kept Record' findability north star (DESIGN.md's Findable-Over-Fresh Rule). Since routes are code-based in src/router.tsx, the cheapest fix is a tiny useDocumentTitle(title) hook (set on mount/update, restore default on unmount) called from each page component with the page name or post/space title (e.g. `${post.title} · postwork` in PostPage.tsx once the post loads); alternatively wire TanStack Router's built-in `head`/meta option per route in router.tsx.
>
> _Files:_ `src/router.tsx`, `index.html`, `src/routes/PostPage.tsx`, `src/routes/SpacePage.tsx`, `src/routes/WallPage.tsx`

**Do:** Small `useDocumentTitle` hook or TanStack Router `head` option per route; `"<post title> · postwork"` on PostPage once loaded.
**Verify:** `grep -rn "document.title\|useDocumentTitle\|head:" src/` shows coverage for every route in `src/router.tsx`.

---

## Phase 5 — Frontend architecture

### Step 5.1 — Restructure the overlay store

> **Audit finding (confirmed · impact: high · effort: medium) — StoreProvider builds its context value without useMemo and returns hooks through context**
>
> src/lib/store.tsx:439-452 constructs the StoreValue object literal fresh on every StoreProvider render (no useMemo), so any overlay state change (markRead, createReply, a re-render cascading from SessionProvider) hands a new identity to every useStore consumer — AppShell, FeedPage, PostPage, QuickPostBar, all dialogs, all flash-experiment components re-render together. Worse, the 'query hooks' useFeed/useSearch/usePost/useReplies/useCounts/useWall (store.tsx:211-316) are closures defined inside the provider body and invoked through the context object (e.g. store.useFeed(...) at src/routes/FeedPage.tsx:34, store.useCounts() at src/components/AppShell.tsx:20). Hooks called via an object property are invisible to rules-of-hooks tooling (the repo has no ESLint config at all — no eslint.config.js and no eslint dep in package.json), can never be memoized (each closure captures posts/replies/postBumps/reads state), and make the provider un-splittable. Cleaner shape: keep a narrow context holding only overlay state + the stable useCallback mutators (markRead, markAllRead, createReply, createPost, summarize), memoize that value, and move useFeed/usePost/useReplies/useWall/useSearch/useCounts to module-level exported hooks in store.tsx that call useQuery + useContext(StoreContext) directly. applyOverlay/enrichSessionPost are already useCallbacks so they move into the context value unchanged. This also creates the seam for replacing useCounts (which today derives badge counts by pulling the entire merged feed through useFeed({}) in the shell on every route) with a cheaper dedicated selector or query later.
>
> _Files:_ `/Users/m3/Developer/postwork/src/lib/store.tsx`, `/Users/m3/Developer/postwork/src/routes/FeedPage.tsx`, `/Users/m3/Developer/postwork/src/components/AppShell.tsx`

**Do:** Minimum: wrap the context `value` in `useMemo`. Better (recommended, still contained): keep only overlay **state + mutators** in context; export `useFeed`/`useSearch`/`usePost`/`useReplies`/`useCounts`/`useWall` as module-level hooks that call `useQuery` + `useStore()` internally. No behavior change — this is a refactor; the session-overlay semantics (documented at the top of store.tsx) must be preserved exactly.
**Verify:** typecheck; every consumer compiles unchanged or with mechanical import swaps.

### Step 5.2 — Single `Priority` type, typed search params

> **Audit finding (confirmed · impact: medium · effort: small) — Priority union is re-declared five times and untyped router search params force `as never` casts**
>
> The priority literal union exists as: the priority validator in convex/schema.ts:12; a private `type Priority` in src/lib/store.tsx:32; three inline repeats in src/lib/spaces.tsx (lines 43, 76, 384); and the PRIORITIES const in src/lib/format.ts:21. None reference each other. Compounding it, router.tsx:18-23 types FeedSearch.priority as plain `string`, so FeedPage.tsx narrows with `PRIORITIES.includes(search.priority as never)` (line 16) and passes `priority: (priority as never) ?? undefined` (line 36), and store.tsx:219 passes `priority: args.priority as never` into useQuery. Fix: export `export type Priority = (typeof PRIORITIES)[number]` (or `Infer<typeof priority>` from the schema export) from src/lib/types.ts — the file already exists as the client-type layer and is the right home; use it in store.tsx, spaces.tsx, and type FeedSearch.priority as `Priority | undefined` with the narrowing done inside validateSearch (router.tsx:41-47). All three `as never` casts then delete cleanly. Same pass: priorityStyles in format.ts:23 is Record<string, ...> and should be Record<Priority, ...> for exhaustiveness, and SessionReply in store.tsx:43-51 is a field-by-field re-declaration of Doc<"replies"> that can just be `type SessionReply = Doc<"replies">`.
>
> _Files:_ `/Users/m3/Developer/postwork/src/lib/store.tsx`, `/Users/m3/Developer/postwork/src/lib/spaces.tsx`, `/Users/m3/Developer/postwork/src/lib/format.ts`, `/Users/m3/Developer/postwork/src/lib/types.ts`, `/Users/m3/Developer/postwork/src/router.tsx`, `/Users/m3/Developer/postwork/src/routes/FeedPage.tsx`

**Do:** Export one `Priority` type (derive from `convex/schema.ts`'s `priority` validator via `Infer`, or from `PRIORITIES as const`), import it everywhere, and type the router search schema so the `as never` casts in FeedPage/store die naturally.
**Verify:** `grep -rn '"urgent" | "high"' src/` → one declaration; `grep -rn "as never" src/` → zero.

### Step 5.3 — Honest local-id handling

> **Audit finding (confirmed · impact: medium · effort: medium) — Forged local ids use `as unknown as Id<...>` casts and isLocalId is threaded through context and props instead of exported**
>
> The overlay mints synthetic ids by lying to the type system: store.tsx:343 (`as unknown as Id<"replies">`) and store.tsx:396 (`as unknown as Id<"posts">`). Everything downstream then treats a `local_p1` string as a real Convex Id, and correctness depends on every backend-touching call site remembering to guard with isLocalId (usePost store.tsx:278, useReplies store.tsx:293, summarize store.tsx:425, AgentSummary.tsx:22, AgentsPage.tsx:57). Cleaner shape: model it explicitly — `type LocalId<T extends string> = \`local_${string}\` & { __table?: T }`, `type PostRef = Id<"posts"> | LocalId<"posts">`, make isLocalId a type-guard (`id is LocalId<T>`), and have StoreValue signatures accept PostRef so TypeScript forces the narrowing before any useQuery/action call instead of relying on discipline. If that ripple is too big for the demo, the minimum is one documented `makeLocalId<T>(prefix, n)` helper next to isLocalId so the double-cast exists in exactly one place. Independently: isLocalId is a module-level pure function (store.tsx:30) yet it is exposed through the context value (StoreValue.isLocalId, store.tsx:96/451) and then passed down as a prop (src/routes/AgentsPage.tsx:22 and :127 `isLocalId={store.isLocalId}`); just `export { isLocalId }` from store.tsx and import it directly.
>
> _Files:_ `/Users/m3/Developer/postwork/src/lib/store.tsx`, `/Users/m3/Developer/postwork/src/routes/AgentsPage.tsx`, `/Users/m3/Developer/postwork/src/components/AgentSummary.tsx`

**Do:** Centralize the forgery in one `makeLocalId<T>(table, n)` helper with the cast and a comment, export `isLocalId` from the module (drop it from context/props), and keep the `local_` convention documented in one place.
**Verify:** `grep -rn "as unknown as Id" src/` hits only the helper; `isLocalId` no longer appears in `StoreValue` or component props.

### Step 5.4 — Flatten/document the provider pyramid

> **Audit finding (confirmed · impact: low · effort: small) — The five-provider pyramid in main.tsx has an undocumented ordering dependency and no composition seam**
>
> main.tsx:18-30 nests ConvexProviderWithAuth > SessionProvider > StoreProvider > AgentTasksProvider > SpacesProvider > ExperimentProvider inline. Assessment: global scope is genuinely required for all of them — every provider holds session-only state that must survive route changes (store overlay, agent tasks listed on /agents but dispatched from /posts/*, spaces invites, active-experiment slug), so pushing them down to route layouts would drop state on navigation; that part is fine. What is fragile is the invisible ordering contract: AgentTasksProvider calls useStore() and useSession() (src/lib/agentTasks.tsx:49-50), SpacesProvider and StoreProvider call useSession() (spaces.tsx:223, store.tsx:102) — reorder the pyramid and the app throws at runtime with no compile-time signal. Extract an `AppProviders` component (e.g. src/lib/providers.tsx) that owns the nesting with a comment stating the dependency chain (Session → Store → AgentTasks; Session → Spaces), leaving main.tsx as bootstrap only. This also gives flash experiments and future tests a single mount point instead of copying the pyramid.
>
> _Files:_ `/Users/m3/Developer/postwork/src/main.tsx`, `/Users/m3/Developer/postwork/src/lib/agentTasks.tsx`, `/Users/m3/Developer/postwork/src/lib/spaces.tsx`

**Do:** At minimum, a comment in `src/main.tsx` documenting the required order (AgentTasksProvider depends on StoreProvider which depends on SessionProvider). Optionally compose them into one `<AppProviders>` component so the ordering lives in exactly one file.
**Verify:** typecheck; ordering constraint is stated where the ordering is defined.

### Step 5.5 — Fix graduated flash experiments (includes a live bug)

> **Audit finding (confirmed · impact: medium · effort: medium) — 'Graduated' flash experiments keep full stale forks of the shipped components — including a double-composer bug**
>
> Two experiments marked status:'shipped'/'graduated — now the default experience' retain complete copies of the code that shipped, instead of rendering the shipped component. (1) centered-rail.tsx:18-103 (CenteredRailShell) is a near line-for-line fork of src/components/AppShell.tsx:18-110 (same 3-column grid, left rail, right 'your queue' rail) but has already drifted: AppShell's '+ new post' is a Link to '/' (AppShell.tsx:63-68) and its nav includes 'experiments' and search-aware active states, while the fork still opens NewPostDialog and lacks those. (2) inline-bottom-composer.tsx:11-135 is a pre-polish fork of QuickPostBar (no hover-pop/minimize/Escape behavior added in commits 131d2b4/d2c60c3). Worse, FeedPage.tsx:45-46 renders {slots.feedHeader} AND <QuickPostBar /> unconditionally, so previewing the shipped inline-bottom-composer experiment mounts two overlapping fixed bottom-docked composers, both 'fixed inset-x-0 bottom-0 z-40'. Fix: for graduated experiments, point appSlots at the shipped component (shell: AppShell, feedHeader: null/removed) so the preview equals reality, or drop their appSlots entirely and rely on the ImplementedRow archive in FlashExperimentsPage.tsx:352-375; if a feedHeader composer slot must remain, FeedPage should suppress QuickPostBar when the slot supplies one.
>
> _Files:_ `src/flashExperiments/experiments/centered-rail.tsx`, `src/flashExperiments/experiments/inline-bottom-composer.tsx`, `src/components/AppShell.tsx`, `src/components/QuickPostBar.tsx`, `src/routes/FeedPage.tsx`

**Do:** Follow the finding: graduated/shipped experiments should render the shipped components (or drop their `appSlots`), and `FeedPage` must suppress `QuickPostBar` when an experiment's `feedHeader` slot supplies a composer — that double-composer overlap is the one genuine runtime bug in this phase.
**Verify:** activating the `inline-bottom-composer` experiment renders exactly one bottom composer; graduated previews match the shipped UI.

### Step 5.6 — Reuse thread components in `ExperimentDiscussion`

> **Audit finding (confirmed · impact: medium · effort: small) — Reply-thread tree building and reply composer re-implemented in ExperimentDiscussion**
>
> src/flashExperiments/ExperimentDiscussion.tsx re-implements three pieces that already exist in src/components/: (1) buildTree at ExperimentDiscussion.tsx:18-29 duplicates the parent-map/roots algorithm of ReplyTree.tsx:26-37 (only difference: iteration over byId.values() vs the replies array); (2) ReplyItem (ExperimentDiscussion.tsx:164-246) mirrors ReplyNode's recursion, indentation-by-depth, author row (Avatar + name + UserRoleTag + timeAgo) and inline reply toggle from ReplyTree.tsx:39-103; (3) a private Composer (ExperimentDiscussion.tsx:248-315) repeats components/Composer.tsx's trim/busy/⌘-Enter-submit/textarea recipe. The auth-gating and Convex mutation are genuinely different, so full unification isn't warranted — but the pure logic should be shared. Fix: move buildTree into src/lib (e.g. lib/replyTree.ts, generic over {_id, parentId}) and import it from both files; extract the textarea + '⌘/ctrl + enter' hint + submit-button row into a small ComposerShell component that both Composer.tsx and ExperimentDiscussion's composer render around their own submit handlers.
>
> _Files:_ `src/flashExperiments/ExperimentDiscussion.tsx`, `src/components/ReplyTree.tsx`, `src/components/Composer.tsx`

**Do:** Share the reply-tree assembly and reply composer with the main thread view (`ReplyTree`/`Composer`) instead of the fork.
**Verify:** tree-building logic exists once; typecheck.

### Step 5.7 — Derive `ExperimentSlot` from `ExperimentSlots`

> **Audit finding (confirmed · impact: low · effort: small) — ExperimentSlot display tags are a hand-maintained shadow of the real ExperimentSlots keys and have already diverged**
>
> src/flashExperiments/registry.tsx:12-20 declares ExperimentSlot as a hand-written string union used for the lab page's display tags, while the actual override surface is `keyof ExperimentSlots` in src/flashExperiments/slots.ts:15-32. They already disagree: the tag is "app-shell" but the real key is `shell` (used by centered-rail.tsx:127 and wide-review-shell.tsx). Every experiment also hand-lists its `slots` tags separately from its `appSlots` object (e.g. centered-rail.tsx:118 `slots: ["app-shell"]` vs :126-128 `appSlots: { shell }`), so a renamed or added slot silently leaves tags stale — nothing type-checks the correspondence. Fix: delete the ExperimentSlot union and the per-experiment `slots` field; derive the tags at render time in FlashExperimentsPage from `Object.keys(experiment.appSlots) as (keyof ExperimentSlots)[]`, with a tiny label map ({ shell: "app-shell" }) if the display name should differ. One source of truth, zero drift.
>
> _Files:_ `/Users/m3/Developer/postwork/src/flashExperiments/registry.tsx`, `/Users/m3/Developer/postwork/src/flashExperiments/slots.ts`, `/Users/m3/Developer/postwork/src/routes/FlashExperimentsPage.tsx`

**Do:** `type ExperimentSlot = keyof ExperimentSlots` (fixing the `app-shell` vs `shell` mismatch), and derive each experiment's `slots` display list from its `appSlots` keys instead of hand-maintaining both.
**Verify:** typecheck; no experiment declares `slots` independently of `appSlots`.

---

## Phase 6 — Backend truth & dead code

### Step 6.1 — Decide: dead Group-B backend

> **Audit finding (confirmed · impact: high · effort: medium) — Dead Group-B backend: convex/spaces.ts and the orgs/spaces/spaceMemberships tables parallel the client-baked SpacesProvider and are never used**
>
> The app has two disjoint 'spaces' implementations. The live one is src/lib/spaces.tsx: fully client-side baked data (bakedOrgs/bakedSpaces/bakedMemberships/bakedPosts, lines 84-198) with its own Org/Space/Membership/SpacePost types using plain string ids, consumed only by SpacesPage/SpacePage/LinkedOrgsPage. The dead one is the backend: convex/spaces.ts (list, membershipsForSpace, feedForSpace queries) is never called — no file under src/ references api.spaces — and the orgs/spaces/spaceMemberships tables (convex/schema.ts:146-178) plus the Group-B post fields spaceId/visibility/orgId (schema.ts:67-71) and the postVisibility validator (schema.ts:27) are never written: convex/seed.ts wipes/inserts only users/posts/replies/postReads, and no db.insert targets those tables anywhere. The schema even documents overlay behaviors ('the overlay's createSpace de-duplicates slugs', schema.ts:153-154) that only exist client-side, cementing the false impression the two are wired together. Either delete convex/spaces.ts, the three tables, postVisibility, and the three optional posts fields (plus the by_space_id index at schema.ts:87), or seed those tables and port SpacesProvider to Convex queries with the same session-overlay pattern store.tsx uses. For a read-only demo, deletion is the right call; the baked provider already carries the feature.
>
> _Files:_ `/Users/m3/Developer/postwork/convex/spaces.ts`, `/Users/m3/Developer/postwork/convex/schema.ts`, `/Users/m3/Developer/postwork/src/lib/spaces.tsx`

**Do:** This is an owner decision — **ask before deleting**. Either (a) delete `convex/spaces.ts` + the `orgs`/`spaces`/`spaceMemberships` tables (and the just-added `posts.orgId`/`visibility` plumbing) since the shipped Group-B feature is the client-baked `SpacesProvider`, or (b) keep them as the target architecture and add a `NEXT.md`-style note that they're unwired. Don't leave the ambiguity.
**Verify:** whichever way: no schema table without a reader/writer, or an explicit comment saying why it exists.

### Step 6.2 — Decide: dead `agentTasks` table

> **Audit finding (confirmed · impact: medium · effort: small) — agentTasks table is never written and the client AgentTask type has silently drifted from it**
>
> convex/schema.ts:127-141 defines an agentTasks table with three indexes, and schema.ts:19 exports an agentTaskStatus validator — but the only non-schema reference to agentTasks in convex/ is the runAgent action in convex/agentTasks.ts, which is a pure action that never touches ctx.db. All task state actually lives in the client AgentTasksProvider (src/lib/agentTasks.tsx:52 useState). Meanwhile the hand-written client type AgentTask (src/lib/agentTasks.tsx:16-29) re-declares the table shape and has already drifted: it adds an `error?: string` field the schema lacks, and its `_id` is a plain string not Id<"agentTasks">. Pick one: (a) delete the agentTasks table, its indexes, and the agentTaskStatus validator from schema.ts, keeping the client type as the single source of truth for this session-only feature; or (b) if persistence is planned, define the client type as Doc<"agentTasks"> & { error?: string } so drift is impossible. For the demo, (a) matches the read-only-backend architecture stated in store.tsx:17-27.
>
> _Files:_ `/Users/m3/Developer/postwork/convex/schema.ts`, `/Users/m3/Developer/postwork/convex/agentTasks.ts`, `/Users/m3/Developer/postwork/src/lib/agentTasks.tsx`

**Do:** Same decision pattern: delete the table (the client `AgentTask` lives session-only in `src/lib/agentTasks.tsx`) or wire persistence. If kept, reconcile the type drift (`error` field).
**Verify:** schema and client type agree, or the table is gone.

### Step 6.3 — Backend hardening follow-ups (from the previous session)

Not from the audit — carried over from the hardening pass:

- **`subject` still leaks through enrichment paths.** `users.list` strips it now, but full user docs (including `subject` for shoo-authenticated members) still ship through `posts.feed`/`posts.get`/`posts.search` (author + participants), `replies.listForPost`, and `discussions.getThread`. Add one `publicUser()` projection in `convex/users.ts` and apply it at every enrichment site. Types stay compatible (`subject` is optional).
- **`flashExperiments.listVotes`** collects every vote row per slug and counts in JS on every reactive read. Fine at demo scale; if experiments grow, maintain denormalized up/down counters per the Convex guidelines.
- **Regenerate `convex/_generated/`** with `bunx convex codegen` the first time a configured deployment is available (api.d.ts was hand-edited to remove the deleted `reads` module).

---

## Phase 7 — Docs & repo hygiene

### Step 7.1 — Reconcile DESIGN.md with the shipped shell

> **Audit finding (confirmed · impact: high · effort: medium) — DESIGN.md specifies a sticky glass top header that no longer exists — the app now uses a three-column sidebar shell**
>
> DESIGN.md:317-322 (Header / Nav) specifies 'Sticky, z-30, 85%-opacity near-black over backdrop-blur, hairline bottom border, max-w-3xl centered. Brand mark is a wine P tile... carries an inline N unread · M urgent status and the user switcher.' DESIGN.md:243-246 (Elevation) calls this sticky header 'the single piece of elevation.' Reality: src/components/AppShell.tsx:27 renders a max-w-6xl three-column grid (left nav rail with a plain 'postwork' text wordmark at line 29-31, no wine P tile, no sticky glass header), the unread/urgent counts live in a right-rail 'your queue' panel (lines 79-99), and UserSwitcher sits at the bottom of the left rail (lines 70-72) — the result of commits 131d2b4/c8f36b8. Fix: rewrite DESIGN.md's Header/Nav section and the Elevation paragraph to describe the sidebar shell (rails, active-item treatment, '+ new post' placement, queue panel). While reconciling, decide on the tracked-uppercase rail labels — AppShell.tsx:80 ('your queue') and UserSwitcher.tsx:41 render tracked all-caps, which DESIGN.md:224-225 forbids ('Sentence case... never tracked all-caps', agent badge being 'the one sanctioned uppercase' per DESIGN.md:306-308) — either lowercase them in code or sanction a rail-label style in the spec.
>
> _Files:_ `/Users/m3/Developer/postwork/DESIGN.md`, `/Users/m3/Developer/postwork/src/components/AppShell.tsx`, `/Users/m3/Developer/postwork/src/components/UserSwitcher.tsx`

> **Audit finding (confirmed · impact: medium · effort: small) — DESIGN.md frontmatter recipes contradict its own prose and the code: agent-summary/tag-scope claim solid deep-wine fills, and rounded.sm claims 2px while components render 4px**
>
> Three drifts inside DESIGN.md itself: (1) frontmatter agent-summary (DESIGN.md:81-86) declares backgroundColor deep-wine (#8c1862) with wine-glow text, but the prose (DESIGN.md:289-293) and the actual component (src/components/AgentSummary.tsx:42, 'border-accent/25 bg-accent/[0.06]') use a hairline wine frame over a 6% wash — the frontmatter version would be an unreadable solid-magenta block. tag-scope frontmatter (DESIGN.md:90-95) has the same solid-fill error vs the real chip (src/components/PostCard.tsx:29, 'border-accent/30 bg-accent/10'). (2) The prose says the scope tag uses an 'accent/5 fill' (DESIGN.md:300) while PostCard.tsx:29 uses accent/10 — pick one. (3) DESIGN.md:50 declares rounded.sm as 2px and DESIGN.md:306-307 calls the agent badge 'rounded-sm (2px)', but Tailwind v4's default --radius-sm is 4px and src/index.css @theme (lines 3-28) sets no radius overrides, so every rounded-sm element (AgentTag.tsx:8, AgentSummary.tsx:45, UserRoleTag.tsx:16, RichText.tsx:10) actually renders 4px. Fix: encode the wash recipes (border+alpha fill) in the frontmatter or drop the fills it cannot express; align accent/5 vs accent/10; and either add --radius-sm: 2px to the @theme block in src/index.css or change the spec to 4px.
>
> _Files:_ `/Users/m3/Developer/postwork/DESIGN.md`, `/Users/m3/Developer/postwork/src/index.css`, `/Users/m3/Developer/postwork/src/components/AgentSummary.tsx`, `/Users/m3/Developer/postwork/src/components/PostCard.tsx`, `/Users/m3/Developer/postwork/src/components/AgentTag.tsx`

**Do:** Rewrite DESIGN.md's Header/Nav + Elevation sections to describe the shipped three-column sidebar shell; fix the frontmatter recipes to match the (correct) code treatments — `agent-summary`/`tag-scope` as accent washes, not solid deep-wine fills; settle `rounded.sm` (2px, per step 1.1) and the uppercase decision (step 1.4) and the 10px badge step (step 3.2) in the same pass.
**Verify:** every frontmatter recipe matches either the code or an explicitly updated spec choice.

### Step 7.2 — Purge the retired monospace aesthetic

> **Audit finding (confirmed · impact: high · effort: small) — AGENTS.md and PRODUCT.md still mandate the retired 'monospace everywhere' terminal aesthetic, contradicting DESIGN.md and the shipped CSS**
>
> AGENTS.md:88 titles the design section 'Design conventions (style is derived from pcstyle.dev)' and AGENTS.md:95 states '**All-mono UI text** (`--font-mono`). This is the defining trait.' PRODUCT.md:41-42 describes the brand as 'terminal-adjacent, monospace, warm near-black', PRODUCT.md:54 says the surface is 'dark, monospace', and PRODUCT.md:67 lists 'one accent, monospace, lowercase chrome' as a principle. Reality: src/index.css:36-43 sets the body to --font-sans (Inter Variable) and src/index.css:55-61 scopes --font-mono to code/pre/kbd/samp only; DESIGN.md:359-360 explicitly retires the terminal look ('Don't reintroduce monospace for UI text — it is now scoped to code/pre only'). Since agents are told to read AGENTS.md first, this actively steers new UI work back to the retired aesthetic. Fix: reconcile toward DESIGN.md/index.css (they agree) — rewrite AGENTS.md:88-103 to say Inter humanist sans with mono scoped to code, and update the three PRODUCT.md phrases to match ('warm near-black, Inter, one wine accent').
>
> _Files:_ `/Users/m3/Developer/postwork/AGENTS.md`, `/Users/m3/Developer/postwork/PRODUCT.md`, `/Users/m3/Developer/postwork/DESIGN.md`, `/Users/m3/Developer/postwork/src/index.css`

**Do:** Update both docs to the Inter-based system DESIGN.md and `src/index.css` actually implement (mono is scoped to code).
**Verify:** the retired all-mono phrase no longer appears in root markdown docs.

### Step 7.3 — Refresh README

> **Audit finding (confirmed · impact: medium · effort: small) — README's project layout and run instructions describe deleted backend modules and an old header UI**
>
> README.md:165-179 ('Project layout') lists 'reads.ts — per-user unread tracking' and 'posts.ts — feed · search · get · counts · create', but convex/reads.ts no longer exists and convex/posts.ts now exports only feed/search/get (convex/posts.ts:43,88,117); it also omits the actual modules (agentTasks.ts, discussions.ts, flashExperiments.ts, spaces.ts, users.ts, auth.config.ts) and lists 3 routes/6 components where src/routes/ has 10 files and src/components/ has 18. README.md:37-38 says 'Use the avatar menu (top-right) to switch teammates' — the UserSwitcher now sits at the bottom of the left sidebar (src/components/AppShell.tsx:70-72). Related user-facing copy drift: src/components/AgentSummary.tsx:33 tells users to 'Set PIONEER_API_KEY (or AI_GATEWAY_API_KEY)' when a key is missing, but the default provider is OpenAI (convex/ai.ts:24, README.md:60-69) — the in-app hint should lead with OPENAI_API_KEY. Fix: regenerate the layout tree from the real directories, fix the switcher location sentence, and update the AgentSummary fallback copy to match the documented provider order.
>
> _Files:_ `/Users/m3/Developer/postwork/README.md`, `/Users/m3/Developer/postwork/convex/posts.ts`, `/Users/m3/Developer/postwork/src/components/AgentSummary.tsx`, `/Users/m3/Developer/postwork/convex/ai.ts`

**Do:** Update the project-layout section (no `reads.ts`; `posts.ts` = feed/search/get; `users.ts` = list/updateProfile) and the header-UI description.
**Verify:** every file/function README names exists.

### Step 7.4 — Regenerate OG images

> **Audit finding (confirmed · impact: medium · effort: medium) — OG social images still use the retired all-monospace terminal style and cite the wrong domain**
>
> public/og.svg:12-14 styles every text element with an SF Mono/JetBrains Mono monospace stack, and public/og.png is its rendered copy — the exact 'terminal-everywhere' look DESIGN.md:359-360 retires; the wordmark tile uses rx=20 (og.svg:32) against the system's ≤8px-radius rule (DESIGN.md:278). og.svg:27 also brands the card 'postwork.app' while index.html:20,26,38 declare og:url/og:image at https://postwork.pcstyle.dev/ — so the shared card names a domain the meta tags contradict. Since this is the app's public face, it undermines the Inter-based identity everywhere the link is shared. Fix: rebuild og.svg with the Inter stack (matching --font-sans in src/index.css:19-21), correct or drop the domain string, tighten the tile radius, and re-export og.png at 1200x630.
>
> _Files:_ `/Users/m3/Developer/postwork/public/og.svg`, `/Users/m3/Developer/postwork/public/og.png`, `/Users/m3/Developer/postwork/index.html`

**Do:** Rebuild `public/og.svg`/`og.png` in the current Inter + wine aesthetic with the real domain (`postwork.pcstyle.dev`); re-export `og.png` at 1200×630.
**Verify:** og.svg contains no monospace font stack and no `postwork.app` text.

### Step 7.5 — Archive stale planning docs

> **Audit finding (confirmed · impact: medium · effort: small) — Completed/stale planning docs (HANDOFF.md, MVP_PROMPT.md, the Theo brief, NEXT.md item 1) clutter the root and contradict shipped code**
>
> HANDOFF.md is a finished punch-list dated 2026-06-29 whose 'What NOT to do' (HANDOFF.md:158-160) forbids shipping feed filter links 'until FeedPage accepts URL search params' — but that work has landed: src/router.tsx:41-45 validates FeedSearch and src/routes/FeedPage.tsx:13-19 reads space/priority/unread from useSearch, and AppShell.tsx:44-45 already links to /?priority=urgent. NEXT.md item 1 (NEXT.md:5-15) likewise claims filters live in 'local useState' and 'are not shareable' — now false. MVP_PROMPT.md is the original one-shot build prompt with no ongoing value, and "Theo's Projects_ Team Communication Rewrite.md" is the source brief with a shell-hostile filename (spaces + underscore). Fix: move HANDOFF.md, MVP_PROMPT.md, and the Theo brief to docs/archive/ (renaming the brief to something like theo-brief.md), and rewrite or delete NEXT.md item 1 (mark it done, or narrow it to what remains, e.g. normalizing invalid params). Keep README.md, PRODUCT.md, DESIGN.md, AGENTS.md, NEXT.md as the live doc set and update NEXT.md's HANDOFF.md reference.
>
> _Files:_ `/Users/m3/Developer/postwork/HANDOFF.md`, `/Users/m3/Developer/postwork/NEXT.md`, `/Users/m3/Developer/postwork/MVP_PROMPT.md`, `/Users/m3/Developer/postwork/Theo's Projects_ Team Communication Rewrite.md`, `/Users/m3/Developer/postwork/src/routes/FeedPage.tsx`, `/Users/m3/Developer/postwork/src/router.tsx`

**Do:** **Ask the owner** before deleting; the low-risk move is `git mv` HANDOFF.md, MVP_PROMPT.md, NEXT.md, and "Theo's Projects_ Team Communication Rewrite.md" into `docs/archive/` with a one-line README note.
**Verify:** repo root contains only living docs (README, DESIGN, PRODUCT, AGENTS, CLAUDE).

### Step 7.6 — Pin dependencies

> **Audit finding (confirmed · impact: high · effort: small) — 12 of 20 dependencies are pinned to 'latest'/'beta' dist-tags; Tailwind, TanStack Router, and the ai betas are the riskiest for UI stability**
>
> package.json:16-39 pins react, react-dom, @tanstack/react-router, convex, tailwindcss, @tailwindcss/vite, vite, typescript, @types/react, @types/react-dom, @vitejs/plugin-react, and npm-run-all to 'latest', plus ai, @ai-sdk/gateway, and @ai-sdk/openai-compatible to the 'beta' dist-tag. bun.lock currently resolves tailwindcss/@tailwindcss/vite 4.3.1, @tanstack/react-router 1.170.16, react 19.2.7, vite 8.1.0, typescript 6.0.3, ai 7.0.0-beta.184 — but any `bun update`, lockfile regeneration, or dependency addition re-resolves the dist-tags and can silently jump majors. Riskiest for design work: tailwindcss + @tailwindcss/vite (a v5 would change utility semantics under the @theme tokens in src/index.css), @tanstack/react-router (1.x ships frequent breaking minors), react/react-dom (a major bump breaks the whole tree), and the three 'beta' tags (arbitrary breaking pre-releases). Fix: replace dist-tags with ranges from bun.lock — caret ranges for stable packages (e.g. "tailwindcss": "^4.3.1", "@tanstack/react-router": "^1.170.16") and exact versions for the betas (e.g. "ai": "7.0.0-beta.184").
>
> _Files:_ `/Users/m3/Developer/postwork/package.json`, `/Users/m3/Developer/postwork/bun.lock`

**Do:** Replace `latest`/`beta` dist-tags in `package.json` with the caret ranges of the versions already resolved in `bun.lock` (the lockfile lists exact versions — e.g. tailwindcss 4.3.1, @tanstack/react-router 1.170.16, react 19.2.7, typescript 6.0.3, ai 7.0.0-beta.184). Then `bun install` and confirm the lockfile is unchanged (or only trivially reordered).
**Verify:** `grep -c '"latest"\|"beta"' package.json` returns 0; `bun install && bun run typecheck` passes.

---

## Appendix — Audit provenance

- Auditors: 5 parallel agents (tokens, components, architecture, routes, cruft), each returning structured findings with falsifiable claims.
- Verification: every claim was handed to an independent skeptical verifier instructed to refute it against the repo. 37 confirmed, 1 partial (step 4.3), 0 refuted.
- Impact/effort labels on each quoted finding are the auditors' estimates; treat them as guidance, not law.
- The raw findings JSON (38 entries, with per-claim verification evidence) came from workflow run `wf_121a09ac-5d7` in the generating session.
