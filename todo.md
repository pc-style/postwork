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
4. **Tab-title badge count** — `(3) postwork` in the document title so a pinned
   tab shows unread count.

## ui polish (shivam, post-page screenshot review)

- [ ] sidebar panels (agent summary / ask an agent): add left accent lines,
      make the whole sidebar collapsible.
- [ ] typographic hierarchy pass: differentiate with font size, weight, and
      opacity — bold+bright = important, less opaque = extra info. Post body
      description slightly lower opacity ("too much space. can use slightly
      less opacity for the description").
- [ ] alignment audit of the post page (ask opus/fable for suggestions).
