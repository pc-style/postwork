# Product

## Register

product

## Users

Internal teammates catching up asynchronously on what their team has decided and
discussed. They arrive with a question ("what happened on the release train?",
"did we close the incident?") and need to reconstruct context fast — usually
after time away, often without having been in the room. They are colleagues, not
power users learning a tool; the interface should be legible to anyone on the
team, while staying dense enough to triage many threads quickly.

The deployed instance is a public, no-auth demo (an in-app user switcher lets
anyone act as any seeded teammate), so a secondary audience is people evaluating
the "structured posts beat chat" thesis. The design serves the teammate first;
the demo viewer benefits from the same clarity.

## Product Purpose

Postwork is a post-based team communication app — the spiritual successor to
Facebook Workplace, built on the thesis that **structured posts beat
Slack-style chat** for organizational communication. Posts (not channels) are the
top-level unit: durable threads with nested replies, activity bumping, priority
and unread state, full-text search, and an AI agent-summary slot so a returning
teammate can catch up in seconds.

Success is when "posts > chat" feels *obviously right* the moment you use it: a
decision is one findable post instead of a scrolled-past message, sub-discussions
stay attached to their topic, and the feed can be triaged at a glance. The
interface's job on every screen is to make that thesis self-evident — durable,
findable, calm — rather than to argue for it.

## Brand Personality

Calm, precise, confident — a quiet expert's tool. The voice is lowercase,
matter-of-fact, and unhurried; it states things plainly and trusts the reader.
It should feel like a well-kept engineering surface (warm near-black, Inter,
one wine accent) where structure and signal are the point, not
decoration or persuasion. No hype, no exclamation, no engagement bait — the
confidence comes from clarity, not volume.

## Anti-references

- **Slack / Teams chat clutter** — noisy, ephemeral, notification-soup. Postwork
  is the antithesis: durable, threaded, low-noise. Nothing should feel like an
  endless scroll of disposable messages.
- **Generic SaaS** — cream/indigo palettes, uniformly rounded card grids, gradient
  hero-metric dashboards, eyebrow kickers above every section. None of this. The
  surface is warm near-black, Inter, and committed to one wine accent.
- (Adjacent to avoid for the same reasons: old corporate-blue Facebook Workplace
  social bloat, and consumer-social engagement mechanics — likes, reactions,
  algorithmic feeds.)

## Design Principles

1. **Posts are durable, chat is disposable** — every design choice should make a
   thread feel like a kept record, not a passing message. Permanence, findability,
   and threaded context win over recency theater.
2. **Triage at a glance** — unread, priority, activity, and AI summary are the
   load-bearing signals. They must read instantly and never get buried in chrome.
3. **The tool disappears into the task** — earned familiarity over novelty.
   Standard affordances, consistent component vocabulary screen to screen, no
   invented controls for ordinary jobs.
4. **Signal over decoration** — warm near-black, Inter, one wine accent,
   lowercase chrome, no emoji.
   Color and weight carry meaning (state, priority), never ornament.
5. **Quiet confidence** — state things plainly. The interface persuades by being
   obviously clearer than chat, not by saying so.

## Accessibility & Inclusion

Pragmatic: sensible, well-built defaults rather than a formally certified WCAG
target. In practice that means real focus states and full keyboard navigation,
body and interactive text that clears comfortable contrast against the dark
surfaces (watch the muted-gray text especially), priority states distinguishable
by more than hue alone (label + dot, not color only), and a
`prefers-reduced-motion` path for any motion. Treat AA-level contrast and keyboard
access as the working floor even though the project isn't chasing a badge.

## Thread media

Posts and replies can carry up to eight image or video attachments. PNG, JPEG,
GIF, and WebP images are accepted up to 10 MB; MP4 and WebM video is accepted up
to 50 MB and plays inline in the thread. JPEG and PNG sources up to 40 MB are
resized or compressed in the browser when useful, with a 10 MB upload target.
GIF and WebP files are uploaded unchanged so animation is never silently
flattened, and video is not transcoded in the browser.
