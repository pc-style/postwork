# postwork design system

Rules for anyone (human or agent) editing UI. Tokens live in `src/index.css` `@theme`
and are the source of truth; this doc explains the roles behind them. Where this doc
and `docs/design.md` disagree, this doc and the code win (`docs/design.md` predates
the polish sweep and has stale chip/selection rules).

## color roles

- `bg` page background. `surface` cards/panels. `surface-2` selection fill, skeleton base, raised hover.
- `border` all 1px borders. `fg` primary text. `muted` secondary text and idle interactive text. `faint` separators, tertiary hints.
- One accent family: `accent` (solid fills), `accent-soft` (focus outlines, accent text, wordmark "work"), `accent-hover`.
- Accent means ACTION (buttons, focus, caret, selection highlight). Never use accent to indicate location or selection state; active nav/tabs are `bg-surface-2 text-fg`, no accent.
- Priority colors: `urgent` (also the error color), `high`, `normal`. Tint fills at low opacity (`bg-urgent/10 text-urgent`), never solid red buttons.
- `accent-fg` text/icons on SOLID accent fills (primary buttons). It stays light in both themes; `fg` on `bg-accent` breaks in light mode.
- No new hex values in components. Need a new color? Add a token in `@theme` first.

## theming

- Two themes, same roles: dark (default) and light. Dark values live in `@theme`; light overrides them under `html.light` in `src/index.css`. Components never branch on theme - if something needs a different value per theme, fix the token, not the component.
- Preference is per-device (`dark`/`light`/`system`), stored at `postwork:theme`, owned by `src/lib/theme.ts` (toggle in settings > display). A pre-paint script in `index.html` applies the class and meta theme-color before the bundle loads; keep its hexes in sync with the tokens.
- Isolated trees that can't read CSS vars (Clerk) duplicate the palette per theme in `src/lib/providers.tsx` (`useClerkAppearance`); code blocks render dual shiki themes (`vesper` dark / `min-light` light, flipped in index.css). Update all of these when token values change.

## type scale

Exactly 4 sizes, used via Tailwind text utilities:

- `text-body` 14px: the default for almost everything - UI text, content, chips,
  tags, meta rows, and buttons of every size.
- `text-title` 15px: card titles, section headers, wordmark.
- `text-display` 20px: page-level headings.
- `text-code` 13px: code and mono data only.

The only exceptions are the two landing-hero sizes on the marketing page. Rule of
thumb: one font size for almost everything; header/footer/sidebar chrome may use
`text-title`/`text-display`, but never invent a smaller size to make something feel
secondary. Hierarchy comes from color (`fg` vs `muted` vs `faint`) and spacing -
shrinking the font is a bandaid on the element's importance, not hierarchy. Chips
and tags stay compact through tight padding (`px-1.5 py-px`) and `leading-tight`,
not a smaller size. Casing: all UI chrome (nav, buttons, headers, labels, errors, empty
states) is lowercase; user-generated content is never transformed. Use `…` not `...`;
`·` separates meta items and document titles (`page · postwork`).

## radius roles

- `rounded-sm` 2px: tags, chips, badges, skeleton blocks.
- `rounded-md` 6px: every interactive control - buttons (all variants), inputs, nav items, selection rows.
- `rounded-lg` 8px: cards, panels, dialogs, sheets. This is the maximum radius.
- `rounded-full` only for avatars and spinners. No other values, no arbitrary radii.

## states

- Selected/active (nav, tabs, toggles, selection rows): `bg-surface-2 text-fg`, optionally `border-accent/60` on form controls. Font weight NEVER changes between states (weight changes cause layout shift). Hovering an already-active item changes nothing.
- Unselected: `text-muted`, `hover:text-fg` (plus `hover:bg-surface` or `hover:border-accent/40` as fits). Active state derives from the router location, never from click state (`src/lib/activeNav.ts`).
- Focus: `outline 2px accent-soft, offset 2px` (global `:focus-visible` in index.css; Button and `.ui-field` restate it). Never swap border-color as a focus indicator.
- Disabled: reduce with opacity/`text-muted`, `cursor-not-allowed` (global). Keep the border; do not hide the element.
- Error: inline `<p role="alert" className="ui-error">` next to the field, lowercase message; invalid fields get `aria-invalid="true"` (urgent border via `.ui-field`). No toasts.
- Loading: skeletons (`.ui-skeleton`, `src/components/Skeleton.tsx`) for pages and lists. The spinner exists only inside Button's loading overlay, which keeps the label invisible-but-present so the button footprint never changes (`loading` + `loadingLabel="saving…"`).

## motion

- Default transition: 150ms ease-out, animating color/background/border-color/transform/opacity only. Never animate size, padding, or layout properties directly.
- Press feedback: `scale: 0.96` via `.ui-button` / `.ui-interactive-media`.
- Dialogs/sheets: 200ms with `--ease-spring` via `@starting-style` (already wired on `dialog[open]`).
- `prefers-reduced-motion` is handled globally in index.css; do not add per-component media queries.
- Collapse/expand (reply trees, agent panels, disclosures): anchor scroll to the BOTTOM of the collapsing region so the page moves with the collapse instead of jumping; use a quick animation; if the pointer stays on the toggle after collapsing, expanding again reverses the same anchoring so the button never moves off-screen. Use this pattern for any new disclosure.

## utility classes (index.css)

- `.ui-field` all text inputs/textareas/selects. Lives in `@layer components` so Tailwind utilities win: override height with `min-h-24` etc. at the call site, never by editing the class.
- `.ui-button` on every Button (via the component); gives the 150ms transition + press scale. Use the `Button` component, not raw `<button>`.
- `.ui-error` inline error note (urgent tint). `.ui-skeleton` shimmer block. `.ui-spinner` Button-internal only.
- `.ui-dialog` dialog/sheet shadow stack. `.ui-popover` floating menus/pickers/anchored confirms (theme-aware, lighter than dialogs). `.ui-reveal` 150ms entrance for progressively disclosed chrome (e.g. composer footer).
- `.ui-media-outline` / `.ui-interactive-media` hairline + hover/press treatment for images and embeds.
- `.prose-post`, `.type-heading`, `.type-description`, `.type-numeric` text-wrapping helpers; they never set font sizes.

## writing

- Lowercase everywhere in chrome. Sentence case only in placeholders and `aria-label`s.
- No em or en dashes, ever. Use a hyphen or restructure the sentence.
- No decorative dots or bullets. A dot means real semantic state (priority, unread) or the `·` meta separator, nothing else.
- Button labels are lowercase verb phrases (`add reply`, `save workspace address`) and never wrap (`whitespace-nowrap` is built into Button).
- No emoji or pictographs. Icons are inline SVG, `stroke="currentColor"`, `strokeWidth 1.5`, usually `size-5`.

## changing the system

- Change token VALUES in `src/index.css` `@theme` and update this doc in the same PR.
- Never introduce a new size, radius, or color inline in a component. Use an existing token or add one (and document its role here).
- New shared patterns (a third loading style, a new chip tone) get a utility class or component prop, not one-off classes at call sites.
