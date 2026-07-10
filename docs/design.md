---
name: Postwork
description: Posts, not channels — a calm, durable record of team decisions.
colors:
  deep-wine: "#8c1862"
  wine-glow: "#b53a82"
  near-black: "#0a0a0b"
  surface: "#121014"
  surface-2: "#18151a"
  hairline: "#252327"
  ink: "#e8e6e3"
  muted: "#8a8782"
  faint: "#4a4845"
  urgent: "#ff6b6b"
  high: "#d9a441"
  normal: "#8a8782"
typography:
  display:
    fontFamily: "'Inter Variable', Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.011em"
  body:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.011em"
    fontFeature: "'cv02', 'cv03', 'cv04', 'cv11'"
  label:
    fontFamily: "{typography.display.fontFamily}"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Cascadia Code', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  sm: "2px"
  md: "6px"
  lg: "8px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.deep-wine}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "6px 12px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.wine-glow}"
    textColor: "{colors.ink}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.wine-glow}"
    rounded: "{rounded.md}"
    padding: "4px 10px"
  card-post:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "16px"
  card-post-hover:
    backgroundColor: "{colors.surface-2}"
  agent-summary:
    borderColor: "{colors.deep-wine} / 25%"
    backgroundColor: "{colors.deep-wine} / 6%"
    textColor: "{colors.wine-glow}"
    rounded: "{rounded.lg}"
    padding: "16px"
  tag-priority:
    rounded: "{rounded.md}"
    padding: "2px 6px"
    typography: "{typography.label}"
  tag-scope:
    borderColor: "{colors.deep-wine} / 30%"
    backgroundColor: "{colors.deep-wine} / 10%"
    textColor: "{colors.wine-glow}"
    rounded: "{rounded.md}"
    padding: "2px 6px"
    typography: "{typography.label}"
  chip-org:
    backgroundColor: "{colors.near-black}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "4px 10px"
    typography: "{typography.label}"
  tag-agent:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
    typography: "{typography.label}"
---

# Design System: Postwork

## 1. Overview

**Creative North Star: "The Kept Record"**

Postwork is a calm, durable log of how a team thinks and decides. The whole
surface is built to make a post feel like a permanent entry in a ledger rather
than a message scrolling past — warm near-black, a clean humanist sans
(Inter) throughout, and a single deep-wine accent that lights up only the things
that carry signal. The aesthetic is quiet and editorial: a composed reading
surface where structure and state are the content, and chrome recedes until you
need it. Confidence comes from clarity and restraint, not volume.

This system explicitly rejects chat clutter — no notification soup, no ephemeral
recency theater, no consumer-social engagement mechanics (likes, reactions,
algorithmic feeds). It equally rejects generic SaaS: there is no cream-and-indigo
palette, no uniformly rounded card grid, no gradient hero-metric dashboard, and
no all-caps eyebrow kicker above every section. Warmth lives in the typography and
the wine accent, never in a tinted near-white background.

Depth is conveyed by tonal layering (`near-black → surface → surface-2`) and
hairline borders rather than shadows; the page reads flat and composed at rest,
and lifts only in response to state. Density is deliberate and legible: a returning
teammate should be able to triage the whole feed at a glance.

**Key Characteristics:**

- Warm near-black canvas; one deep-wine accent, used sparingly.
- Inter (variable humanist sans) everywhere; monospace reserved for code only.
- Lowercase navigation chrome; labels, tags, and breadcrumbs use sentence case.
- User content keeps its own casing.
- Flat by default; depth and emphasis appear only on state.
- No emoji — minimal line-style SVG icons (comment, lock) where a glyph reads
  faster than a word; mono text affordances (`/`, `ai`) otherwise.
- Small radii (cards `8px`, controls `6px`, tags `2px`, member chips full-pill).

## 2. Colors

A warm near-black palette in which a single deep-wine accent carries every moment
of signal; everything else is a tonal neutral.

### Primary

- **Deep Wine** (`#8c1862`): The one accent. Carries primary actions (`new
  post`, `invite org`), the brand mark, selection, and the agent-summary frame.
  Used on ≤10% of any screen — its rarity is the point.
- **Wine Glow** (`#b53a82`): The softer, brighter sibling. Used for accent *text*
  and links (`active 5d ago`, `ai summary`, unread dot, scope tags, the org-only
  lock), and for the primary button's hover state. Where Deep Wine fills, Wine
  Glow speaks.

### Neutral

- **Near-Black** (`#0a0a0b`): The body canvas and the inset fill of member chips
  and inputs.
- **Surface** (`#121014`): The resting surface for cards and panels — one step up
  from the canvas.
- **Surface-2** (`#18151a`): The next tonal step up, used on hover and for inset
  affordances (agent tag, role badge, code).
- **Hairline** (`#252327`): Borders and dividers. The structural grid of the UI;
  flat layering leans on these instead of shadows.
- **Ink** (`#e8e6e3`): Primary text and headings. Warm off-white, not pure white.
- **Muted** (`#8a8782`): Secondary text — metadata, snippets, labels, timestamps.
- **Faint** (`#5c5956`): Decorative separators, disabled ornament, and low-emphasis
  surfaces only. Faint never carries instructions, required metadata, errors, or
  disabled control labels. Meaningful secondary text uses Muted (`#a19d98`).

### Tertiary (priority state colors)

Warm, muted state colors — distinct from the page accent, never used as
decoration.

- **Urgent Coral** (`#ff6b6b`): The `Urgent` priority chip and dot.
- **High Gold** (`#d9a441`): The `High` priority chip and dot.
- **Normal Grey** (`#8a8782`): The `Normal` priority chip and dot (shares Muted).

### Identity colors (avatars & orgs)

Generated avatar/org colors (seeded users, auto-provisioned discussion
members, baked org data) all draw from one shared warm-muted palette:
`convex/avatarPalette.ts`. It stays in the wine/teal/gold/moss family and
never includes blue or violet — see the One Accent Rule below.

### Named Rules

**The One Accent Rule.** There is exactly one accent — deep wine — per page. Never
reintroduce indigo, blue, or a second hue for emphasis. Priority colors are state
vocabulary, not a second accent.

**The Tinted-Neutral Ban.** The canvas stays warm near-black. Never translate
"warm" into a cream or tinted near-white background; warmth is carried by type and
the wine accent.

## 3. Typography

**Display / Title / Body / Label Font:** Inter Variable — humanist sans, with a
system-ui / -apple-system / Segoe UI / Roboto fallback stack.

**Code Font:** `ui-monospace` system stack — SF Mono, JetBrains Mono, Cascadia
Code, Menlo, Consolas (monospace fallback). Scoped to `code`, `pre`, `kbd`, and
`samp` only.

**Character:** One humanist sans in multiple weights does all the work — Inter's
even rhythm and high legibility make the surface read as a calm, modern record
rather than a terminal. Inter character variants `cv02 cv03 cv04 cv11` are on for
a cleaner single-storey feel; global tracking is a subtle `-0.011em`, loosened to
`normal` on small labels and all code. There is no second display family — weight
and size carry hierarchy.

### Hierarchy

- **Display / Title** (600, `1.25rem`, 1.2, `-0.02em`): Page titles and space
  names. Postwork has no oversized hero type — this is a product surface, so the
  largest tier stays compact and tight.
- **Title** (600, `0.9375rem`, 1.3): Post titles in cards and on the detail page.
  Unread titles go semibold + ink; read titles drop to medium weight.
- **Body** (400, `0.875rem`, 1.6): Post bodies, replies, and summaries. Prose runs
  in `.prose-post` with `white-space: pre-wrap`; cap reading measure at ~65–75ch on
  the detail page.
- **Label** (500, `0.6875rem`, `normal`): Metadata, priority/scope chips, counts,
  role badges. Sentence case (`High`, `Space`, `Owner`) — never tracked all-caps.
- **Code / Mono** (400, `0.8125rem`, 1.6): Inline code and fenced blocks only. The
  one place fixed-width type survives.

### Named Rules

**The Lowercase-Nav Rule.** Primary navigation and global actions stay lowercase
(`agents`, `spaces`, `orgs`, `new post`) — the app's quiet, unhurried register.
Everything else (labels, tags, breadcrumbs, role badges) uses sentence case, and
user-authored content always keeps its own casing.

**The No-Emoji Rule.** No emoji or pictographic glyphs from the Unicode emoji
block, ever. Where a symbol reads faster than a word, use a minimal 1.5px-stroke
line SVG icon (comment bubble, lock) tuned to `currentColor`; otherwise prefer a
mono text affordance (`/`, `ai`). Typographic arrows (`←` `→`) are allowed.

## 4. Elevation

Flat at rest. Postwork uses no decorative drop shadows; depth is built from tonal
layering (`near-black → surface → surface-2`) and 1px hairline borders. The shell
uses sticky side rails rather than a lifted glass header: navigation sits in the
left rail, queue context sits in the right rail, and the reading column remains
flat and centered. The space glyph carries a barely-there radial wine wash to read
as an avatar, never as a lifted card. Everything else gains depth or emphasis only
as a *response to state*: a card lifts to `surface-2` on hover, an unread post
grows a wine-glow dot and a semibold ink title, focus and selection brighten
toward the accent.

### Named Rules

**The State-Lift Rule.** Surfaces are flat and equal at rest. Elevation, brighter
fills, and accent color are reserved for state — hover, unread, focus, selection.
If an element looks "lifted" with nothing happening, it's wrong.

## 5. Components

Earned familiarity over novelty: standard affordances, one consistent vocabulary
screen to screen. Every interactive element should read as obviously itself.

### Buttons

- **Shape:** `rounded-lg` (8px) for primary, `rounded-md` (6px) for secondary /
  ghost controls; full-pill (`9999px`) for the contextual `invite org` action next
  to member chips.
- **Primary:** Deep Wine fill (`#8c1862`), ink text, `6px 12px` padding; hover
  brightens to Wine Glow (`#b53a82`). Used for `new post` / `invite org`. One
  primary action per view.
- **Ghost / Secondary:** Transparent with a wine-tinted hairline border, Wine Glow
  text; hover adds a faint `accent/15` wash. Used for `generate` / `regenerate`.
- **Disabled:** Keep labels legible and preserve the control's shape. Use a muted
  border/fill and muted text rather than fading the whole control. Loading keeps
  the label footprint stable, adds a small progress indicator, sets
  `aria-busy`, and blocks duplicate activation.

### Cards (post)

- **Shape:** `rounded-lg` (8px), 1px hairline border, `surface` fill, `16px`
  padding. Cards top out at 8px radius — never over-round.
- **Resting → Hover:** border shifts toward `accent/40`, fill lifts to `surface-2`.
  No shadow.
- **Unread marker:** a `size-2` Wine Glow dot in the gutter; title goes semibold +
  ink. Read cards reserve the same gutter space (no layout shift).
- **Meta rail (space cards):** a right-aligned column carries the comment count
  (line-icon + number) and an org-only lock, so triage signal sits apart from the
  body.

### Agent Summary

- A distinct wine-framed panel: `accent/25` border over a barely-there
  `accent/[0.06]` wash, `rounded-lg`, `16px` padding. Header pairs an `ai` chip
  (`accent/20` fill, Wine Glow text) with an `agent summary` label. This is the one
  surface where the accent frames a whole block — its job is to make the catch-up
  affordance unmistakable.

### Tags & Chips

- **Priority chip:** `rounded-md`, `2px 6px`, a colored dot + sentence-case label,
  tinted in the priority's own hue (`Urgent`/`High`/`Normal`). The label, not just
  the color, names the state — never color alone.
- **Scope tag:** `rounded-md`, wine-tinted (`accent/30` border, `accent/10` fill,
  Wine Glow text), sentence case (`Space`/`Org`/`Public`). The accent's only
  recurring text use in the feed.
- **Org chip / member pill:** full-pill, near-black fill, hairline border; pairs an
  org color-square (initials) with the org name and a `surface-2` role sub-badge
  (`Owner`/`Member`).
- **Agent badge:** `surface-2` fill, hairline border, muted tracked `agent`,
  `rounded-sm` (2px). The smallest radius in the system, and the one sanctioned
  uppercase.

### Inputs / Fields

- **Style:** 1px hairline border, near-black fill, `rounded-md`/`rounded-lg`, and
  at least 44px height for primary form controls. Labels stay visible above the
  control; placeholders are examples, never labels.
- **Focus:** border shifts to Wine Glow and a visible 2px focus outline remains
  unclipped. Errors keep an urgent border plus specific inline recovery copy.
- **Selection:** priority is one labeled native radio group. Independent filters
  use `aria-pressed`; selected state changes border, fill, weight, and text so it
  never depends on hue alone.

### Header / Nav

- On tablet and desktop, the shell uses a flexible rail sized with `clamp()` and
  a centered reading column. On narrow screens the rail is removed completely
  and replaced with a compact sticky top bar plus a full-height navigation panel.
- Navigation links are lowercase, at least 44px tall on touch layouts, and expose
  the current route with `aria-current`. The user switcher remains reachable in
  both shell forms.
- The global `new post` action is a stable bottom dock trigger with safe-area
  spacing. It opens the complete dialog immediately and never reveals fields on
  hover, uses a timer, or hides required validation state.
- Admin uses the same responsive shell rule. Desktop tables remain semantic;
  narrow screens show labeled record cards with explicit `view details` actions.

### Space Glyph (signature)

- A `size-20` `rounded-lg` tile with a hairline border and a faint radial wine
  wash, carrying the two member orgs' color dots separated by a `×`. Identifies a
  cross-company space at a glance without an uploaded image; derived entirely from
  membership data.

### States (all interactive components)

Standardize: default · hover · focus · active · disabled · loading · error.
Disabled labels remain readable. Loading uses stable in-place copy plus a small
progress indicator for controls; page and list loading use layout-appropriate
skeletons hidden from assistive technology with one concise announced status.
Errors remain visible in a small urgent-on-urgent/10 inline note until resolved.

Destructive post and reply actions open a trigger-anchored `alertdialog` without
replacing or shifting the action row. Focus moves to Cancel, Tab remains within
the panel, Escape and outside click dismiss it, and focus returns to the trigger
or a configured fallback. Dialogs and sheets use native focus trapping, named
headings, reliable trigger restoration, mobile safe-area padding, and full-screen
sheet layout on narrow viewports.

### Named Rules

**The Findable-Over-Fresh Rule.** Components privilege durability and triage signal
(unread, priority, activity, summary) over recency theater. If a treatment makes
the feed feel like a chat stream, it's wrong.

## 6. Do's and Don'ts

### Do:

- **Do** keep Inter as the single UI family; carry hierarchy with weight (400 /
  500 / 600) and size, not a second display face.
- **Do** keep the canvas warm near-black and build depth from tonal layering
  (`near-black → surface → surface-2`) plus 1px hairlines.
- **Do** reserve deep wine for ≤10% of a screen — primary action, brand, selection,
  scope tags, and the agent-summary frame.
- **Do** name state with a label, not color alone (`High` + gold dot, `Org` + lock).
- **Do** keep navigation and global actions lowercase; sentence-case everything
  else; never touch user-authored casing.
- **Do** use minimal line-style SVG icons (1.5px stroke, `currentColor`) only where
  a glyph triages faster than a word.

### Don't:

- **Don't** reintroduce monospace for UI text — it is now scoped to `code` / `pre`
  only. The old terminal-everywhere look is retired.
- **Don't** add a second accent hue (no indigo, no blue); priority colors are state
  vocabulary, not a second brand color.
- **Don't** translate "warm" into a cream, sand, or tinted near-white background.
  Warmth comes from type and the wine accent.
- **Don't** use emoji or pictographic Unicode glyphs anywhere in UI or chrome.
- **Don't** add notification soup, likes/reactions, or algorithmic recency theater;
  Postwork is a durable record, not a chat stream.
- **Don't** over-round (cards stay ≤8px) or pair a 1px border with a wide soft drop
  shadow — depth is tonal, not a ghost-card shadow.
- **Don't** add tracked all-caps eyebrow kickers above sections or gradient hero
  metrics; this is a product surface, not a SaaS landing page.
