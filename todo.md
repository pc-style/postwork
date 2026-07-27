# todo

Working ideas backlog. Feedback sources: shivam + Pronsh (Discord, 27 July 2026).

## retention hooks (Pronsh: "i need something to hook me in")

1. **Digest email as teaser** — daily "3 posts moved, 1 needs you" via existing
   Resend delivery. Subject line is the hook ("shivam replied to wrec 3.0
   update"); body shows the AI summary teaser, not full content. Click = visit.
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
   - [ ] follow-up: mentions + analytics digest layer on the same pipe.
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
