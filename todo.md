# todo

Working ideas backlog. Feedback sources: shivam + Pronsh (Discord, 27 July 2026).

## dx / infra (Pronsh, PR #25 review, 30 July)

- [ ] evaluate react compiler (vite plugin + eslint plugin) in one pass —
      would make most manual `useMemo`/`useCallback`/`memo` redundant.
      don't strip memoization piecemeal before it lands.
- [ ] consider `useActionState` for button-triggered async mutations
      (agent tasks panel, settings saves) if we wrap them in form actions;
      today the manual busy/error pair is the repo convention.

## retention hooks (Pronsh: "i need something to hook me in")

1. **Digest email as teaser** — daily "3 posts moved, 1 needs you" via existing
   Resend delivery. Subject line is the hook ("shivam replied to wrec 3.0
   update"); body shows the AI summary teaser, not full content. Click = visit.
   - [x] shipped (16 Aug): notificationScheduler cron drives the existing
         delivery boundary — immediate urgent email + daily digest at
         quiet-hours end, idempotent per local day. Emails come from
         users.email synced from the auth identity.
   - [ ] follow-up: richer email body (AI summary teaser instead of title
         list).
2. **"Needs you" notification trigger** — only notify on mentions, replies to
   your posts, or finished agent tasks. Scarcity keeps the signal trusted.
3. **Inbound cross-posting (favorite)** — connector agent pulls Twitter/X
   analytics + mentions into a daily Postwork post rendered in the
   agent-summary slot. The thing Pronsh checks Twitter for lives in Postwork.
   Same pipe as the GitHub webhook ingestion, different source.
   - [x] demo prototype shipped (27 July): X Pulse connector agent + seeded
         daily digest post with baked summary and a "mentions need a human
         reply" loop.
   - [x] real cross-posting shipped (27 July): `convex/xSync.ts` polls
         x.pcstyle.dev every 30 min and mirrors a handle's new posts into
         Postwork via the X Pulse connector (no X API keys, no extension).
         Enable with `bunx convex env set X_SYNC_HANDLE <handle>`.
         Also: `/api/connectors/x` bearer endpoint for push-style clients.
   - [x] analytics digest layer shipped (16 Aug): convex/xPulse.ts snapshots
         followers + per-post engagement hourly and publishes a daily digest
         post (follower delta, top posts by engagement). One digest per local
         day per connector, race-safe via xLastDigestLocalDate.
   - [ ] follow-up: mentions layer — blocked on the proxy's search endpoint
         (currently returns not_found for all queries).
4. **Tab-title badge count** — `(3) postwork` in the document title so a pinned
   tab shows unread count.
   - [x] shipped (27 July): `useUnreadTabBadge` in both shells prefixes the
         document title with the unread count.

## ui polish (shivam, post-page screenshot review)

- [x] clickable links and real opengraph previews in post and reply bodies
      (27 July).
- [x] sidebar panels: left divider line + collapsible sidebar (27 July).
- [x] typographic hierarchy: post body and reply bodies at fg/80, names and
      titles stay bold+bright (27 July).
- [x] alignment pass: tightened breadcrumb dead space, summary teaser skips
      the bare "TL;DR" line (27 July). Revisit after next screenshot review.

## mobile nits (Pronsh, 30 July phone-responsiveness review)

- [x] sign-in page remodel: card contents felt uneven on mobile. Sign-in card
      now comes first, invite/request-access moved below it, double border
      inside the Clerk card removed, even padding (30 July).
- [x] deep-link redirect: /app/settings while logged out now returns to
      settings after sign-in via Clerk forceRedirectUrl (30 July).
- [x] clicking "N unread" in the header/sidebar opens the feed filtered to
      unread; "N urgent" opens the priority view (30 July).
- [x] own reply no longer instantly collapses behind "show 1 reply" — the
      subthread expands on submit (30 July).
- [x] react-scan set up, dev-only (30 July).
- [ ] deferred: solidjs experiment ("only if tokens to burn") — explicitly
      not now per pcstyle.
- [ ] consider: jakubkrehel/skills agent-skill collection for interface
      polish (animation, a11y, product writing).
