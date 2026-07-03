// Shared warm-muted identity palette for avatars and org chips. Keeps every
// generated identity color in the wine/teal/gold/moss family so nothing
// competes with the app's single wine accent (no blue, no violet).
export const AVATAR_PALETTE = [
  "#8c1862", // wine
  "#b53a82", // magenta wine
  "#d9a441", // gold
  "#2e7d52", // moss
  "#c75146", // clay
  "#4f6d8c", // slate
  "#6b5b8c", // plum
  "#3d7d76", // teal
  "#9a7d2e", // ochre
] as const;
