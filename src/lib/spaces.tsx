import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "./session";

export type Org = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
};
export type Space = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerOrgId: string;
  createdAt: number;
};
export type MembershipStatus = "active" | "invited" | "declined";
export type Membership = {
  spaceId: string;
  orgId: string;
  role: "owner" | "member";
  status: MembershipStatus;
};
export type SpacePost = {
  id: string;
  spaceId: string;
  orgId: string;
  authorName: string;
  authorInitials: string;
  authorColor: string;
  title: string;
  body: string;
  priority: "urgent" | "high" | "normal";
  visibility: "space" | "org" | "public";
  replyCount: number;
  createdAt: number;
};

type MembershipWithOrg = {
  org: Org;
  role: "owner" | "member";
  status: MembershipStatus;
};

type SpacesValue = {
  orgs: Org[];
  myOrg: Org;
  allSpaces: Space[];
  spaces: Space[];
  spaceBySlug: (slug: string) => Space | undefined;
  membershipsForSpace: (spaceId: string) => MembershipWithOrg[];
  invitesForMyOrg: { space: Space; fromOrg: Org }[];
  createSpace: (args: {
    name: string;
    description?: string;
    inviteHandles?: string[];
  }) => Space;
  inviteOrg: (spaceId: string, handle: string) => void;
  acceptInvite: (spaceId: string) => void;
  declineInvite: (spaceId: string) => void;
  feedForSpace: (spaceId: string) => SpacePost[];
  postToSpace: (args: {
    spaceId: string;
    title: string;
    body: string;
    priority: "urgent" | "high" | "normal";
    visibility?: "space" | "org" | "public";
  }) => void;
};

const now = Date.now();
const hoursAgo = (hours: number) => now - hours * 60 * 60 * 1000;

const bakedOrgs: Org[] = [
  { id: "org_northwind", name: "Northwind", handle: "northwind", initials: "NW", color: "#8c1862" },
  { id: "org_acme", name: "Acme", handle: "acme", initials: "AC", color: "#4f6d8c" },
  { id: "org_globex", name: "Globex", handle: "globex", initials: "GX", color: "#3d7d76" },
  { id: "org_initech", name: "Initech", handle: "initech", initials: "IN", color: "#d9a441" },
];

const bakedSpaces: Space[] = [
  {
    id: "space_nw_acme_platform",
    name: "northwind × acme — platform integration",
    slug: "northwind-acme-platform-integration",
    description: "launch planning, api contracts, and rollout decisions for the shared platform integration.",
    ownerOrgId: "org_northwind",
    createdAt: hoursAgo(24 * 12),
  },
  {
    id: "space_nw_globex_support",
    name: "northwind × globex — vendor support",
    slug: "northwind-globex-vendor-support",
    description: "operational support lane for incidents, renewals, and account coordination.",
    ownerOrgId: "org_northwind",
    createdAt: hoursAgo(24 * 8),
  },
  {
    id: "space_initech_nw_security",
    name: "initech × northwind — security review",
    slug: "initech-northwind-security-review",
    description: "pending invite for vendor risk review, evidence exchange, and access scoping.",
    ownerOrgId: "org_initech",
    createdAt: hoursAgo(30),
  },
];

const bakedMemberships: Membership[] = [
  { spaceId: "space_nw_acme_platform", orgId: "org_northwind", role: "owner", status: "active" },
  { spaceId: "space_nw_acme_platform", orgId: "org_acme", role: "member", status: "active" },
  { spaceId: "space_nw_globex_support", orgId: "org_northwind", role: "owner", status: "active" },
  { spaceId: "space_nw_globex_support", orgId: "org_globex", role: "member", status: "active" },
  { spaceId: "space_initech_nw_security", orgId: "org_initech", role: "owner", status: "active" },
  { spaceId: "space_initech_nw_security", orgId: "org_northwind", role: "member", status: "invited" },
];

const bakedPosts: SpacePost[] = [
  {
    id: "space_post_1",
    spaceId: "space_nw_acme_platform",
    orgId: "org_acme",
    authorName: "Mira Patel",
    authorInitials: "MP",
    authorColor: "#4f6d8c",
    title: "api contract question: account mapping edge cases",
    body: "We found three customers where the external account id maps to multiple billing entities. Can Northwind confirm whether the canonical id should be workspace-level or contract-level before we freeze the import job?",
    priority: "high",
    visibility: "space",
    replyCount: 3,
    createdAt: hoursAgo(2),
  },
  {
    id: "space_post_2",
    spaceId: "space_nw_acme_platform",
    orgId: "org_northwind",
    authorName: "Theo Browne",
    authorInitials: "TB",
    authorColor: "#8c1862",
    title: "integration timeline after staging dry run",
    body: "Staging dry run is green except for webhook replay ordering. Proposed plan: patch idempotency today, run a second dry run tomorrow morning, and keep the production cutover window on Thursday.",
    priority: "normal",
    visibility: "space",
    replyCount: 6,
    createdAt: hoursAgo(6),
  },
  {
    id: "space_post_3",
    spaceId: "space_nw_globex_support",
    orgId: "org_globex",
    authorName: "Dana Cho",
    authorInitials: "DC",
    authorColor: "#3d7d76",
    title: "incident coordination: delayed export batch",
    body: "The 02:00 UTC export batch missed its delivery window. We have isolated it to a queue worker restart and are backfilling now. Please hold downstream reconciliation until we post the final checksum.",
    priority: "urgent",
    visibility: "space",
    replyCount: 4,
    createdAt: hoursAgo(1),
  },
  {
    id: "space_post_4",
    spaceId: "space_nw_globex_support",
    orgId: "org_northwind",
    authorName: "Sarah Chen",
    authorInitials: "SC",
    authorColor: "#8c1862",
    title: "renewal data request for q3 capacity planning",
    body: "We need updated seat forecasts by region before the renewal model locks. Globex can use the shared spreadsheet, but please post final assumptions here so the decision trail stays searchable.",
    priority: "normal",
    visibility: "space",
    replyCount: 1,
    createdAt: hoursAgo(28),
  },
  {
    id: "space_post_5",
    spaceId: "space_nw_acme_platform",
    orgId: "org_northwind",
    authorName: "Maya Kapoor",
    authorInitials: "MK",
    authorColor: "#8c1862",
    title: "northwind internal note: rollout owner coverage",
    body: "Internal only: support rotation needs a second owner during Acme's launch week. Do not promise 24-hour migration coverage until we confirm staffing.",
    priority: "high",
    visibility: "org",
    replyCount: 2,
    createdAt: hoursAgo(20),
  },
];

const SpacesContext = createContext<SpacesValue | null>(null);
const myOrg = bakedOrgs[0];

function normalizeHandle(handle: string) {
  return handle.trim().replace(/^@/, "").toLowerCase();
}

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "space";
}

function placeholderOrg(handle: string): Org {
  const clean = normalizeHandle(handle);
  return {
    id: `org_local_${clean}`,
    name: clean.replace(/-/g, " "),
    handle: clean,
    initials: clean.slice(0, 2).toUpperCase(),
    color: "#8a8782",
  };
}

export function SpacesProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useSession();
  const [sessionOrgs, setSessionOrgs] = useState<Org[]>([]);
  const [sessionSpaces, setSessionSpaces] = useState<Space[]>([]);
  const [sessionMemberships, setSessionMemberships] = useState<Membership[]>([]);
  const [sessionPosts, setSessionPosts] = useState<SpacePost[]>([]);
  const counter = useRef(0);

  const orgs = useMemo(() => [...bakedOrgs, ...sessionOrgs], [sessionOrgs]);
  const allSpaces = useMemo(() => [...bakedSpaces, ...sessionSpaces], [sessionSpaces]);
  const memberships = useMemo(() => {
    const overrides = new Set(
      sessionMemberships.map(
        (membership) => `${membership.spaceId}:${membership.orgId}`,
      ),
    );
    return [
      ...bakedMemberships.filter(
        (membership) => !overrides.has(`${membership.spaceId}:${membership.orgId}`),
      ),
      ...sessionMemberships,
    ];
  }, [sessionMemberships]);

  const orgById = useMemo(() => new Map(orgs.map((org) => [org.id, org])), [orgs]);
  const spaceById = useMemo(
    () => new Map(allSpaces.map((space) => [space.id, space])),
    [allSpaces],
  );

  const resolveOrgByHandle = useCallback(
    (handle: string) => {
      const clean = normalizeHandle(handle);
      const existing = orgs.find((org) => org.handle === clean);
      if (existing) return existing;
      const created = placeholderOrg(clean);
      setSessionOrgs((prev) => [...prev, created]);
      return created;
    },
    [orgs],
  );

  const membershipsForSpace = useCallback(
    (spaceId: string) =>
      memberships
        .filter((membership) => membership.spaceId === spaceId)
        .map((membership) => ({
          org: orgById.get(membership.orgId),
          role: membership.role,
          status: membership.status,
        }))
        .filter((entry): entry is MembershipWithOrg => entry.org !== undefined),
    [memberships, orgById],
  );

  const spaces = useMemo(
    () =>
      allSpaces.filter((space) =>
        memberships.some(
          (membership) =>
            membership.spaceId === space.id &&
            membership.orgId === myOrg.id &&
            membership.status === "active",
        ),
      ),
    [allSpaces, memberships],
  );

  const invitesForMyOrg = useMemo(
    () =>
      memberships
        .filter((membership) => membership.orgId === myOrg.id && membership.status === "invited")
        .map((membership) => {
          const space = spaceById.get(membership.spaceId);
          const fromOrg = space ? orgById.get(space.ownerOrgId) : undefined;
          return space && fromOrg ? { space, fromOrg } : null;
        })
        .filter((invite): invite is { space: Space; fromOrg: Org } => invite !== null),
    [memberships, orgById, spaceById],
  );

  const inviteOrg = useCallback(
    (spaceId: string, handle: string) => {
      const org = resolveOrgByHandle(handle);
      setSessionMemberships((prev) => {
        const exists = [...bakedMemberships, ...prev].some(
          (membership) => membership.spaceId === spaceId && membership.orgId === org.id,
        );
        if (exists) return prev;
        return [...prev, { spaceId, orgId: org.id, role: "member", status: "invited" }];
      });
    },
    [resolveOrgByHandle],
  );

  const createSpace = useCallback(
    (args: { name: string; description?: string; inviteHandles?: string[] }) => {
      const id = `space_local_${++counter.current}`;
      const baseSlug = slugify(args.name);
      const existingSlugs = new Set(allSpaces.map((space) => space.slug));
      const slug = existingSlugs.has(baseSlug) ? `${baseSlug}-${counter.current}` : baseSlug;
      const space: Space = {
        id,
        name: args.name.trim(),
        slug,
        description: args.description?.trim() || undefined,
        ownerOrgId: myOrg.id,
        createdAt: Date.now(),
      };
      setSessionSpaces((prev) => [...prev, space]);
      const invited = Array.from(new Set(args.inviteHandles ?? []))
        .map((handle) => resolveOrgByHandle(handle))
        .filter((org) => org.id !== myOrg.id);
      setSessionMemberships((prev) => [
        ...prev,
        { spaceId: id, orgId: myOrg.id, role: "owner", status: "active" },
        ...invited.map<Membership>((org) => ({
          spaceId: id,
          orgId: org.id,
          role: "member",
          status: "invited",
        })),
      ]);
      return space;
    },
    [allSpaces, resolveOrgByHandle],
  );

  const setMyInvite = useCallback((spaceId: string, status: MembershipStatus) => {
    setSessionMemberships((prev) => {
      const baked = bakedMemberships.find(
        (membership) => membership.spaceId === spaceId && membership.orgId === myOrg.id,
      );
      const without = prev.filter(
        (membership) => !(membership.spaceId === spaceId && membership.orgId === myOrg.id),
      );
      return [
        ...without,
        {
          spaceId,
          orgId: myOrg.id,
          role: baked?.role ?? "member",
          status,
        },
      ];
    });
  }, []);

  const feedForSpace = useCallback(
    (spaceId: string) =>
      [...bakedPosts, ...sessionPosts]
        .filter((post) => post.spaceId === spaceId)
        .filter((post) => post.visibility !== "org" || post.orgId === myOrg.id)
        .sort((a, b) => b.createdAt - a.createdAt),
    [sessionPosts],
  );

  const postToSpace = useCallback(
    (args: {
      spaceId: string;
      title: string;
      body: string;
      priority: "urgent" | "high" | "normal";
      visibility?: "space" | "org" | "public";
    }) => {
      const name = currentUser?.name ?? "Northwind teammate";
      const initials = name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || myOrg.initials;
      setSessionPosts((prev) => [
        ...prev,
        {
          id: `space_post_local_${Date.now()}`,
          spaceId: args.spaceId,
          orgId: myOrg.id,
          authorName: name,
          authorInitials: initials,
          authorColor: myOrg.color,
          title: args.title.trim(),
          body: args.body.trim(),
          priority: args.priority,
          visibility: args.visibility ?? "space",
          replyCount: 0,
          createdAt: Date.now(),
        },
      ]);
    },
    [currentUser],
  );

  const value = useMemo<SpacesValue>(() => ({
    orgs,
    myOrg,
    allSpaces,
    spaces,
    spaceBySlug: (slug: string) => allSpaces.find((space) => space.slug === slug),
    membershipsForSpace,
    invitesForMyOrg,
    createSpace,
    inviteOrg,
    acceptInvite: (spaceId: string) => setMyInvite(spaceId, "active"),
    declineInvite: (spaceId: string) => setMyInvite(spaceId, "declined"),
    feedForSpace,
    postToSpace,
  }), [
    orgs,
    allSpaces,
    spaces,
    membershipsForSpace,
    invitesForMyOrg,
    createSpace,
    inviteOrg,
    setMyInvite,
    feedForSpace,
    postToSpace,
  ]);

  return <SpacesContext.Provider value={value}>{children}</SpacesContext.Provider>;
}

export function useSpaces() {
  const ctx = useContext(SpacesContext);
  if (!ctx) throw new Error("useSpaces must be used within SpacesProvider");
  return ctx;
}
