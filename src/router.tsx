import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from "@tanstack/react-router";
import { RootLayout } from "./routes/RootLayout";
import { FeedPage } from "./routes/FeedPage";
import { PostPage } from "./routes/PostPage";
import { AgentsPage } from "./routes/AgentsPage";
import { SpacesPage } from "./routes/SpacesPage";
import { SpacePage } from "./routes/SpacePage";
import { LinkedOrgsPage } from "./routes/LinkedOrgsPage";
import { WallPage } from "./routes/WallPage";
import { FlashExperimentsPage } from "./routes/FlashExperimentsPage";
import { FlashExperimentPage } from "./routes/FlashExperimentPage";
import { RedesignLayout } from "./routes/redesign/RedesignShell";
import { RedesignFeedPage } from "./routes/redesign/RedesignFeedPage";
import { RedesignPostPage } from "./routes/redesign/RedesignPostPage";
import { PRIORITIES } from "./lib/format";
import type { Priority } from "./lib/types";

export type FeedSearch = {
  q?: string;
  space?: string;
  priority?: Priority;
  unread?: boolean;
};

// Pass-through root: global providers live in main.tsx, so the root just
// renders whatever route matched. This lets the experiment preview opt out of
// the app chrome (see appLayoutRoute below).
const rootRoute = createRootRoute({ component: Outlet });

// Pathless layout route that paints the normal postwork chrome (header, nav,
// new-post, user switcher). Every "real app" route lives under here.
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): FeedSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    space: typeof search.space === "string" ? search.space : undefined,
    priority: PRIORITIES.includes(search.priority as Priority)
      ? (search.priority as Priority)
      : undefined,
    unread: search.unread === true || search.unread === "true" || search.unread === "1",
  }),
  component: FeedPage,
});

const postRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/posts/$postId",
  component: PostPage,
});

const agentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/agents",
  component: AgentsPage,
});

const spacesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/spaces",
  component: SpacesPage,
});

const spaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/spaces/$slug",
  component: SpacePage,
});

const orgsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/orgs",
  component: LinkedOrgsPage,
});

const wallRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/u/$userId",
  component: WallPage,
});

const flashExperimentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/flash-experiments",
  component: FlashExperimentsPage,
});

// The experiment preview lives under the app layout so it renders the *real*
// shell. Entering it activates the experiment (see FlashExperimentPage); the
// override then stays applied as you navigate the real feed → post → reply.
const flashExperimentRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/flash-experiments/$slug",
  component: FlashExperimentPage,
});

// The "ink" redesign lives on its own pathless layout — a sibling of the app
// layout, not a child — so it renders its own gray-black shell instead of the
// classic postwork chrome.
const redesignLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/redesign",
  component: RedesignLayout,
});

const redesignIndexRoute = createRoute({
  getParentRoute: () => redesignLayoutRoute,
  path: "/",
  validateSearch: (search: Record<string, unknown>): FeedSearch => ({
    q: typeof search.q === "string" ? search.q : undefined,
    space: typeof search.space === "string" ? search.space : undefined,
    priority: PRIORITIES.includes(search.priority as Priority)
      ? (search.priority as Priority)
      : undefined,
    unread:
      search.unread === true ||
      search.unread === "true" ||
      search.unread === "1",
  }),
  component: RedesignFeedPage,
});

const redesignPostRoute = createRoute({
  getParentRoute: () => redesignLayoutRoute,
  path: "/posts/$postId",
  component: RedesignPostPage,
});

const routeTree = rootRoute.addChildren([
  appLayoutRoute.addChildren([
    indexRoute,
    postRoute,
    agentsRoute,
    spacesRoute,
    spaceRoute,
    orgsRoute,
    wallRoute,
    flashExperimentsRoute,
    flashExperimentRoute,
  ]),
  redesignLayoutRoute.addChildren([redesignIndexRoute, redesignPostRoute]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
