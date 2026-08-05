import { useRouterState } from "@tanstack/react-router";

export type NavKey =
  | "home"
  | "priority"
  | "catch-up"
  | "spaces"
  | "agents"
  | "settings"
  | "experiments"
  | "admin";

/**
 * Single source of truth for which primary nav item is active. Derived from
 * the current router location (never from click state), so back/forward
 * navigation, deep links, and child routes always highlight exactly one
 * sensible section:
 *
 * - a section's child routes highlight the section (/app/spaces/x -> spaces)
 * - the feed with ?priority=urgent is "priority"; any other feed view
 *   (including ?unread=true) is "home"
 * - everything else under /app (posts, walls) belongs to the feed -> "home",
 *   so there is never a state where nothing is highlighted
 */
export function useActiveNavKey(): NavKey {
  return useRouterState({
    select: (state): NavKey => {
      const pathname = state.location.pathname.replace(/\/+$/, "");
      const search = state.location.search as { priority?: string };
      if (pathname.startsWith("/app/spaces")) return "spaces";
      if (pathname.startsWith("/app/agents")) return "agents";
      if (pathname.startsWith("/app/settings")) return "settings";
      if (pathname.startsWith("/app/catch-up")) return "catch-up";
      if (pathname.startsWith("/app/flash-experiments")) return "experiments";
      if (pathname.startsWith("/admin")) return "admin";
      if (pathname === "/app" && search.priority === "urgent") return "priority";
      return "home";
    },
  });
}

/**
 * Selection treatment shared by sidebar nav items: color + background only,
 * constant font weight (weight changes cause layout shift). Hovering an
 * already-active item does not change its color.
 */
export function navItemClass(active: boolean): string {
  return `flex min-h-11 items-center rounded-md px-3 py-2 text-body transition-colors ${
    active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"
  }`;
}
