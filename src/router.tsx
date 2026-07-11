import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { AgentsPage } from "./routes/AgentsPage";
import { SpacesPage } from "./routes/SpacesPage";
import { SpacePage } from "./routes/SpacePage";
import { WallPage } from "./routes/WallPage";
import { FlashExperimentsPage } from "./routes/FlashExperimentsPage";
import { FlashExperimentPage } from "./routes/FlashExperimentPage";
import { LandingPage } from "./routes/LandingPage";
import { ChangelogPage } from "./routes/ChangelogPage";
import { JoinPage } from "./routes/JoinPage";
import { RequireAuth } from "./routes/gates";
import { RedesignLayout } from "./routes/redesign/RedesignShell";
import { RedesignFeedPage } from "./routes/redesign/RedesignFeedPage";
import { RedesignPostPage } from "./routes/redesign/RedesignPostPage";
import { CatchUpPage } from "./routes/redesign/CatchUpPage";
import { AdminLayout } from "./routes/admin/AdminShell";
import { AdminOverviewPage } from "./routes/admin/AdminOverviewPage";
import { AdminUsersPage } from "./routes/admin/AdminUsersPage";
import { AdminModelsPage } from "./routes/admin/AdminModelsPage";
import { AdminInvitesPage } from "./routes/admin/AdminInvitesPage";
import { AdminAccessRequestsPage } from "./routes/admin/AdminAccessRequestsPage";
import { AdminAuditLogPage } from "./routes/admin/AdminAuditLogPage";
import { demoPolicy } from "./lib/demoMode";
import { PRIORITIES } from "./lib/format";
import type { Priority } from "./lib/types";

export type FeedSearch = {
  q?: string;
  space?: string;
  priority?: Priority;
  unread?: boolean;
};

function validateFeedSearch(search: Record<string, unknown>): FeedSearch {
  return {
    q: typeof search.q === "string" ? search.q : undefined,
    space: typeof search.space === "string" ? search.space : undefined,
    priority: PRIORITIES.includes(search.priority as Priority)
      ? (search.priority as Priority)
      : undefined,
    unread:
      search.unread === true || search.unread === "true" || search.unread === "1",
  };
}

// Pass-through root: global providers live in main.tsx.
const rootRoute = createRootRoute({ component: Outlet });

// ---------------------------------------------------------------------------
// Public landing — `/` is NEVER auth-gated. Logged-in users see it too and
// get an "open app" CTA.
// ---------------------------------------------------------------------------
const landingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingPage,
});

const changelogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/changelog",
  component: ChangelogPage,
});

const joinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/join/$code",
  component: JoinPage,
});

// ---------------------------------------------------------------------------
// The authenticated product app lives under /app.
// ---------------------------------------------------------------------------
function AppLayout() {
  return (
    <RequireAuth>
      <RedesignLayout />
    </RequireAuth>
  );
}

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: AppLayout,
});

const appFeedRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/",
  validateSearch: validateFeedSearch,
  component: RedesignFeedPage,
});

const appPostRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/posts/$postId",
  component: RedesignPostPage,
});

const appCatchUpRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/catch-up",
  component: CatchUpPage,
});

const appAgentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/agents",
  component: AgentsPage,
});

const appSpacesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/spaces",
  component: SpacesPage,
});

const appSpaceRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/spaces/$slug",
  component: SpacePage,
});

const appWallRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/u/$userId",
  component: WallPage,
});

const flashExperimentsRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/flash-experiments",
  component: FlashExperimentsPage,
});

const flashExperimentRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: "/flash-experiments/$slug",
  component: FlashExperimentPage,
});

// ---------------------------------------------------------------------------
// Admin control plane — /admin, gated to admins (server-enforced too).
// ---------------------------------------------------------------------------
const adminLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: AdminLayout,
});

const adminOverviewRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/",
  component: AdminOverviewPage,
});

const adminUsersRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/users",
  component: AdminUsersPage,
  validateSearch: (search: Record<string, unknown>): AdminUsersSearch => {
    const filter = search.filter;
    return filter === "members" ||
      filter === "agents" ||
      filter === "deactivated"
      ? { filter }
      : {};
  },
});

export type AdminUsersFilter = "members" | "agents" | "deactivated";
export type AdminUsersSearch = { filter?: AdminUsersFilter };

const adminModelsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/models",
  component: AdminModelsPage,
});

const adminInvitesRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/invites",
  component: AdminInvitesPage,
});

const adminAccessRequestsRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/access-requests",
  component: AdminAccessRequestsPage,
});

const adminAuditLogRoute = createRoute({
  getParentRoute: () => adminLayoutRoute,
  path: "/audit-log",
  component: AdminAuditLogPage,
});

// ---------------------------------------------------------------------------
// Legacy redirects — the app used to live at the root (and /redesign).
// ---------------------------------------------------------------------------
const legacyPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/posts/$postId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/posts/$postId", params });
  },
});

const legacyAgentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  beforeLoad: () => {
    throw redirect({ to: "/app/agents" });
  },
});

const legacySpacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/spaces",
  beforeLoad: () => {
    throw redirect({ to: "/app/spaces" });
  },
});

const legacySpaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/spaces/$slug",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/spaces/$slug", params });
  },
});

const legacyWallRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/u/$userId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/u/$userId", params });
  },
});

const legacyRedesignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/redesign",
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
});

const legacyRedesignPostRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/redesign/posts/$postId",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/app/posts/$postId", params });
  },
});

const legacyFeedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/feed",
  beforeLoad: () => {
    throw redirect({ to: "/app" });
  },
});

const routeTree = rootRoute.addChildren([
  landingRoute,
  changelogRoute,
  joinRoute,
  appLayoutRoute.addChildren([
    appFeedRoute,
    appCatchUpRoute,
    appPostRoute,
    appAgentsRoute,
    appSpacesRoute,
    appSpaceRoute,
    appWallRoute,
    ...(demoPolicy.flashExperimentsLab
      ? [flashExperimentsRoute, flashExperimentRoute]
      : []),
  ]),
  adminLayoutRoute.addChildren([
    adminOverviewRoute,
    adminUsersRoute,
    adminModelsRoute,
    adminInvitesRoute,
    adminAccessRequestsRoute,
    adminAuditLogRoute,
  ]),
  legacyPostRoute,
  legacyAgentsRoute,
  legacySpacesRoute,
  legacySpaceRoute,
  legacyWallRoute,
  legacyRedesignRoute,
  legacyRedesignPostRoute,
  legacyFeedRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
