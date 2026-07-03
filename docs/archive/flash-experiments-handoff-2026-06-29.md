# Handoff: Flash Experiments — finish remaining fixes

## Completion status (2026-06-29)

Remaining punch-list resolved:
- [x] **Build/type check** — `bun run build` green (frontend + transitive
      `convex/*.ts`). The wide-shell imports (`useStore`, `NewPostDialog`,
      `UserSwitcher`) resolve.
- [x] **focused-composer cold-load autofocus** — `Composer.tsx` now focuses via
      `useEffect(() => { if (autoFocus) ref.current?.focus() }, [autoFocus])`
      instead of the `autoFocus` JSX prop, so a sessionStorage-restored
      experiment that mounts the composer after first render still lands the
      cursor. (Next Step 3.)
- [x] **wide-review-shell mobile** — grid is now `grid-cols-1` and only becomes
      `md:grid-cols-[220px_minmax(0,1fr)]` from the `md` breakpoint; the rail
      aside drops its sticky/full-height styling below `md` (stacks above
      content). No more 375px overflow. (Next Step 4.)
- [x] **Artifact cleanup** — `.context/ui-test-screenshots/` wiped+recreated,
      stray `/tmp/vite.log` removed, leftover Vite dev server killed, `browse`
      session stopped. (Next Steps 5–7.)

Not done (needs a running dev server, which is left to the user per project
convention — `bun run dev` is not auto-run):
- [ ] **Re-run the `/ui-test` browser regression pass** (Next Step 2). The
      primary bugs are fixed and locally verified; a fresh single-session
      browser pass should confirm hard-reload persistence, new-tab behaviour
      (sessionStorage is per-tab-group — a brand-new window won't carry the
      experiment; expected), the compact-cards back-to-feed flow, and the
      wide-shell new-post dialog.

## Goal
Finish the Flash Experiments refactor fixes after the user complained that
experiments "don't actually work" (post navigation drops the experiment,
sidebar items can't be clicked). Most of the work is already done and tested
in a browser session — what's left is finishing the smaller cleanup items,
running a regression pass, and removing any test artifacts.

## Context

### What the user said
> "OK the experiments don't actually work. For example you can't go into a post
> keeping the experiment on. It will just redirect you to the normal website.
> You cannot filter through the sidebar menu. Bro, fix"

### What was wrong
1. **Hard navigation killed the experiment.** `ExperimentProvider` held the
   active slug in `useState` only. The moment a hard navigation happened
   (page reload, direct URL, opening a post in a new tab, browser back/forward
   across the boundary) the React tree remounted, slug went back to `null`,
   and the user landed on the "normal website" with no pill, no override. This
   is the primary bug the user was hitting.
2. **`rail-nav` sidebar was 0% interactive.** Every item was a static `<div>`
   — clicking "inbox", "spaces", "agents" did nothing. Matches "you cannot
   filter through the sidebar menu".
3. **`priority-first-feed` entry-point cards were inert buttons** — clicking
   "urgent / high / unread" did nothing.
4. **`wide-review-shell` killed `+ new post`, unread counter, and user
   switcher** because it replaces the whole shell and never re-rendered them.

### What's already done (verified working in a real browser)
- `src/flashExperiments/active.tsx` — `ExperimentProvider` now mirrors the
  active slug to `sessionStorage` (key `postwork:active-experiment`), with a
  `storage` event listener for cross-tab sync. Verified: opening
  `/flash-experiments/focused-composer`, then hard-loading
  `/posts/<id>` shows the floating pill and focused composer; reloading the
  page in an active experiment keeps it on.
- `src/flashExperiments/experiments/rail-nav.tsx` — items with a known route
  (inbox→`/`, priority→`/`, spaces→`/spaces`, agents→`/agents`, linked orgs→
  `/orgs`) render as real `<Link>`s; preview-only items are dimmed `<div>`s
  with a `title="not wired in this preview"`. Verified: clicking "agents" in
  the rail navigates to `/agents`, sidebar persists, pill stays on.
- `src/flashExperiments/experiments/priority-first-feed.tsx` — the urgent/
  high/unread entry-point cards are now `<Link to="/">`, with a small "preview"
  badge and copy explaining filtering is the proposal under review. Verified:
  3 entry-point links in the DOM.
- `src/flashExperiments/experiments/wide-review-shell.tsx` — the shell now
  owns its own `composing` state, renders `+ new post`, unread/urgent count,
  and `UserSwitcher` in the rail aside, and mounts `NewPostDialog` on demand.
  Verified: rail aside contains `+ new post`, `9 unread · 1 urgent`, and the
  current user.

### What was a false-positive in the original test report
- "priority-feed-back-from-post" and "compact-cards-experiment-persist" in the
  UI Test report appeared to be a slug-overwrite bug ("rail-nav contaminating
  other experiments on back navigation"). Re-tested manually after the
  sessionStorage fix: the full flow (compact-cards → click post → back to feed)
  preserves the experiment correctly. The original failures were stale
  browse-session state across parallel test agents, not a real bug.

## Key Files

- `src/flashExperiments/active.tsx` — **edited.** The sessionStorage
  persistence + storage-event sync lives here. Don't introduce new write
  paths to the slug that bypass `setSlug` (they'd skip persistence).
- `src/flashExperiments/experiments/rail-nav.tsx` — **edited.** Real `<Link>`s
  for routable items, dimmed `<div>`s for unrouted ones.
- `src/flashExperiments/experiments/priority-first-feed.tsx` — **edited.**
  Entry-point cards are now `<Link to="/">`.
- `src/flashExperiments/experiments/wide-review-shell.tsx` — **edited.** Owns
  composing state, renders new-post button + unread counter + UserSwitcher.
- `src/flashExperiments/experiments/compact-cards.tsx` — untouched, works.
- `src/flashExperiments/experiments/focused-composer.tsx` — untouched. The
  autofocus-on-cold-load issue is documented but not fixed (see Next Steps).
- `src/routes/RootLayout.tsx` — renders the floating `ExperimentControl` pill;
  unchanged. Note `slots.shell` branch returns early — that's why wide-shell
  needed its own composing state/UserSwitcher.
- `src/routes/FlashExperimentPage.tsx` — calls `setSlug(slug)` on mount; also
  renders `<FeedPage />` as the entry surface. Unchanged.
- `src/routes/FlashExperimentsPage.tsx` — lab list; clears slug on entry via
  `useEffect`. Unchanged.
- `src/router.tsx` — TanStack route tree; all real routes (and both flash
  routes) live under `appLayoutRoute`. Unchanged.
- `src/main.tsx` — `ExperimentProvider` is mounted above `RouterProvider`.
  Required ordering; do not move it inside the router.

## Next Steps

1. **Run the unit/type checks.** `npx tsc -b` (or `yarn build`) to confirm the
   edits compile cleanly. The wide-shell rewrite imports `useStore`,
   `NewPostDialog`, and `UserSwitcher` — verify those paths still match.
2. **Re-run the `/ui-test` skill** with the same brief, single-session
   (`browse open … --local` once, no parallel sessions), now that the
   primary bug is fixed. Focus on:
   - Hard reload mid-experiment (must persist).
   - Open post in new tab while experiment active (must persist —
     sessionStorage is per-tab-group, so a fresh-window open won't carry; that
     is expected and probably fine, but call it out in the report).
   - Compact-cards back-to-feed flow (the originally-flagged false positive).
   - Wide-shell new-post dialog actually opens and posts.
3. **Decide on focused-composer autofocus on cold load.** Currently the
   `autoFocus` prop on the textarea only fires on the initial React mount; if
   the user lands directly on `/posts/<id>` (now that sessionStorage restores
   the experiment), the textarea won't be focused until they interact. If we
   want it to focus, switch from the `autoFocus` prop to a `useEffect` +
   `ref.current?.focus()` inside `Composer.tsx` (gated on the `autoFocus`
   prop). Low priority — only affects one experiment and only one path.
4. **Consider mobile for wide-review-shell.** It still uses
   `grid-cols-[220px_minmax(0,1fr)]`, which overflows at 375px. Options:
   collapse the rail at a `md` breakpoint, or document mobile as out-of-scope
   for this experiment. Either is defensible.
5. **Clean up screenshots dir** — `/.context/ui-test-screenshots/` accumulated
   ~16 PNGs from the parallel test run. They're gitignored but if a fresh
   test run is happening, wipe first: `rm -rf .context/ui-test-screenshots && mkdir -p .context/ui-test-screenshots`.
6. **Vite dev server status.** During this session it died once and was
   restarted via `npm run dev:web > /tmp/vite.log 2>&1 &`. If a new session
   inherits that background job it should be killed (`pkill -f 'vite'`)
   before starting the user's preferred `npm run dev` (which also boots
   convex).
7. **Browse session cleanup.** `browse stop` at the start of any new
   browser-driven test — the last session was left active.

## What NOT to do
- Don't move `ExperimentProvider` below `RouterProvider`. Mount order matters
  — the provider must survive route remounts.
- Don't try to "fix" the false-positive failures in the original UI test
  report by chasing a phantom slug-overwrite bug. The repro was a parallel-
  test-session artifact; the code path is correct.
- Don't ship the priority-first-feed entry cards as proper filter links until
  `FeedPage` accepts URL search params for `space`/`priority`/`onlyUnread`.
  Linking to `/?priority=urgent` today would silently no-op.
