#!/usr/bin/env bun
/**
 * One-shot Linear setup for Postwork.
 * Creates project, labels, milestones, parent issues + sub-issues,
 * and sets Done / In Progress / Todo / Backlog from the roadmap.
 *
 * Safe to re-run only if the project does not already exist (exits early).
 */

const API = "https://api.linear.app/graphql";
const KEY = process.env.LINEAR_API_KEY;
if (!KEY) {
  console.error("LINEAR_API_KEY is required");
  process.exit(1);
}

const TEAM_ID = "902d9f19-09fd-443b-818f-646312c8919b";
const VIEWER_ID = "6ec9a3fd-f7d5-4473-af56-ae5c614aedfc";

const STATE = {
  backlog: "56a21667-a919-4831-bb09-e6157e93f83f",
  todo: "a0ca30c8-5fe8-47e9-8dc8-63fecbe78b86",
  inProgress: "938f3325-511c-4e89-967a-84e709b20a82",
  inReview: "8ed16fe8-3572-4d5f-a102-ea3d0c8fa94d",
  done: "49b370e0-c2df-448a-be9f-27bc6d2f05d3",
  canceled: "503079bc-8dbd-4e89-8a4a-aec8b3fd6507",
};

const EXISTING_LABELS = {
  Feature: "f8181a06-aa4a-4a7e-a942-99bc858ed302",
  Improvement: "6c1e336d-00ad-4d46-b369-5afb11b1f34f",
  Bug: "61ceb2ac-d2d9-4a23-ad2d-ea92d47711da",
  Frontend: "94cdd68a-4a4c-4615-9437-e7cd62f0a1d1",
  Backend: "941fef9e-8060-4993-bdc6-dffb5ac2706c",
  UX: "ac9d49c6-9138-476d-97a2-1262c3d5cbfc",
  DevOps: "557ebf81-b86b-4309-a933-3ede15fe5654",
  Analytics: "ed1e9d60-51f0-4d3b-b558-d78407081eba",
  Integration: "3c6f9310-9975-48fe-9735-c306c124db5a",
  Research: "782a2062-1f9c-4921-8be6-f45ce8a1d054",
};

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    const msg = json.errors.map((e) => e.message).join("; ");
    throw new Error(msg);
  }
  return json.data;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureLabel(name, color, teamId = TEAM_ID) {
  // Check team labels
  const data = await gql(
    `query($teamId: String!) {
      team(id: $teamId) {
        labels(filter: { name: { eq: $name } }) {
          nodes { id name }
        }
      }
    }`.replace("$name", `"${name}"`),
    { teamId },
  ).catch(async () => {
    // fallback: list and find
    return null;
  });

  // Simpler: list all team labels and match
  const listed = await gql(
    `query($teamId: String!) {
      team(id: $teamId) {
        labels { nodes { id name } }
      }
    }`,
    { teamId },
  );
  const found = listed.team.labels.nodes.find((l) => l.name === name);
  if (found) return found.id;

  const created = await gql(
    `mutation($input: IssueLabelCreateInput!) {
      issueLabelCreate(input: $input) {
        success
        issueLabel { id name }
      }
    }`,
    {
      input: {
        name,
        color,
        teamId,
      },
    },
  );
  console.log(`  label: ${name} → ${created.issueLabelCreate.issueLabel.id}`);
  return created.issueLabelCreate.issueLabel.id;
}

async function createProject() {
  // Bail if already exists — never re-seed issues on re-run
  const existing = await gql(`{
    projects(filter: { name: { eq: "Postwork" } }, first: 5) {
      nodes { id name url state }
    }
  }`);
  if (existing.projects.nodes.length) {
    const p = existing.projects.nodes[0];
    const count = await gql(
      `{ issues(filter: { project: { id: { eq: "${p.id}" } } }, first: 1) { nodes { id } } }`,
    ).catch(() => null);
    console.error(
      "Project Postwork already exists:",
      p.url,
      "\nRefusing to create duplicate issues. Delete the project (or rename it) before re-running.",
    );
    process.exit(0);
  }

  const content = `# Postwork

Post-based team communication app — a Facebook Workplace successor built on the thesis that **structured posts beat chat**.

## Product thesis
Posts (not channels) are the top-level unit: durable threads, nested replies, activity bumping, priority + unread state, full-text search, and an AI agent-summary slot so a returning teammate can catch up in seconds.

## Mode
Highly experimental flow-design prototype evolving into a real product. Keep a permanent **public demo** on \`postwork.pcstyle.dev\` while shipping product mode behind Clerk.

## Stack
- Bun · Vite · React 19 · TypeScript
- TanStack Router
- Convex (realtime + serverless)
- Clerk (product auth)
- AI SDK v7 (provider-switchable agent summaries)

## Source of truth (repo)
- \`docs/next.md\` — prioritized next work
- \`docs/plan/demo-to-product-progress.md\` — execution tracker
- \`docs/plan/demo-to-product.md\` — locked decisions
- \`docs/organizations.md\` — multi-org gap list
- Branch: \`beta\` (do not touch \`main\` until demo→product is complete)

## Status as of 2026-07-10
Phases 0–1 complete. Multi-tenancy groundwork in place. Hardening mostly done. Differentiator loop (catch-up digest) and demo productization are the active focus.
`;

  const data = await gql(
    `mutation($input: ProjectCreateInput!) {
      projectCreate(input: $input) {
        success
        project { id name url state }
      }
    }`,
    {
      input: {
        name: "Postwork",
        description:
          "Post-based team communication app (Workplace successor). Demo + product dual-mode on Convex/Clerk. Active branch: beta.",
        content,
        teamIds: [TEAM_ID],
        leadId: VIEWER_ID,
        memberIds: [VIEWER_ID],
        color: "#7A1F2B", // wine-ish
        icon: "Chat",
        priority: 2,
        startDate: "2026-07-01",
      },
    },
  );
  const project = data.projectCreate.project;
  console.log(`Created project: ${project.url}`);

  // Mark project as started
  await gql(
    `mutation($id: String!, $input: ProjectUpdateInput!) {
      projectUpdate(id: $id, input: $input) { success project { id state } }
    }`,
    {
      id: project.id,
      input: {
        // state field may be via statusId — try state enum if available
      },
    },
  ).catch(() => {});

  // Try setting state via projectUpdate with state
  try {
    await gql(
      `mutation($id: String!, $input: ProjectUpdateInput!) {
        projectUpdate(id: $id, input: $input) { success project { id state } }
      }`,
      { id: project.id, input: { state: "started" } },
    );
  } catch (e) {
    console.warn("Could not set project state to started:", e.message);
  }

  return project;
}

async function createMilestone(projectId, name, description, sortOrder) {
  const data = await gql(
    `mutation($input: ProjectMilestoneCreateInput!) {
      projectMilestoneCreate(input: $input) {
        success
        projectMilestone { id name }
      }
    }`,
    {
      input: {
        projectId,
        name,
        description,
        sortOrder,
      },
    },
  );
  const ms = data.projectMilestoneCreate.projectMilestone;
  console.log(`  milestone: ${ms.name}`);
  return ms.id;
}

async function createIssue({
  title,
  description,
  projectId,
  milestoneId,
  parentId,
  stateId,
  priority = 3,
  labelIds = [],
  estimate,
}) {
  const input = {
    title,
    description,
    teamId: TEAM_ID,
    projectId,
    stateId,
    priority,
    labelIds: labelIds.filter(Boolean),
  };
  if (milestoneId) input.projectMilestoneId = milestoneId;
  if (parentId) input.parentId = parentId;
  if (estimate != null) input.estimate = estimate;

  // retry on rate limit
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const data = await gql(
        `mutation($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title url state { name } }
          }
        }`,
        { input },
      );
      const issue = data.issueCreate.issue;
      process.stdout.write(
        `  ${issue.identifier} [${issue.state.name}] ${issue.title}\n`,
      );
      await sleep(120); // gentle rate limit
      return issue;
    } catch (e) {
      if (String(e.message).includes("rate") || String(e.message).includes("429")) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Failed to create issue: ${title}`);
}

// ─── Issue tree definition ───────────────────────────────────────────
// status: done | inProgress | todo | backlog

function buildTree(labels, milestones) {
  const L = labels;
  const M = milestones;

  /** @type {Array<{title:string, description:string, status:string, priority?:number, labels?:string[], milestone?:string, children?:any[]}>} */
  return [
    // ═══════════════════════════════════════════════════════════════
    // PHASE 0 — consolidation (DONE)
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Phase 0 — Consolidation (prerequisite)",
      description: `Remove prototype split-brain before product work.

**Exit criteria:** one write path per feature, spaces durable, \`bun run build\` green, demo deploy visually unchanged.

Source: \`docs/plan/demo-to-product.md\` Phase 0 · tracker fully checked.`,
      status: "done",
      priority: 2,
      labels: [L.phase0, L.Feature],
      milestone: M.p0,
      children: [
        {
          title: "Demo-mode switch (VITE_DEMO / DEMO)",
          description: `Introduce single environment switch:
- Frontend: \`src/lib/demoMode.ts\` via \`VITE_DEMO\`
- Backend: \`convex/lib/demo.ts\` via Convex env \`DEMO\`
Default public demo to demo=true so later work lands on the correct side of the flag.`,
          status: "done",
          labels: [L.phase0, L.Frontend, L.Backend],
          children: [
            {
              title: "Add src/lib/demoMode.ts helper",
              description: "Single frontend module; never scatter raw `import.meta.env.VITE_DEMO` reads.",
              status: "done",
              labels: [L.phase0, L.Frontend],
            },
            {
              title: "Add convex/lib/demo.ts helper",
              description: "Backend DEMO env check used by mutations/actions.",
              status: "done",
              labels: [L.phase0, L.Backend],
            },
            {
              title: "Wire Vercel / Convex env for demo vs product deployments",
              description:
                "Two Convex deployments, one repo. Demo domain gets DEMO=true + VITE_DEMO=true; product gets them unset/false.",
              status: "done",
              labels: [L.phase0, L.DevOps],
            },
          ],
        },
        {
          title: "Durable spaces + memberships",
          description: `Spaces become real post threads (not string labels / mock cards).
- Add \`spaces\` + \`spaceMemberships\` tables
- Migrate \`posts.space\` string → \`spaceId\` (keep label denormalized during migration)
- SpacePage renders real posts through PostCard/PostPage primitives
- One seeded org + org-scoped queries`,
          status: "done",
          labels: [L.phase0, L.Backend, L.Feature],
          children: [
            {
              title: "Schema: spaces + spaceMemberships tables",
              description: "Convex schema with org-prefixed indexes.",
              status: "done",
              labels: [L.phase0, L.Backend],
            },
            {
              title: "Migrate posts.space string label → spaceId",
              description: "Keep denormalized label during transition; seed creates real spaces.",
              status: "done",
              labels: [L.phase0, L.Backend],
            },
            {
              title: "SpacePage uses real PostCard / PostPage primitives",
              description: "Kill mock cards from spaces.tsx for product path.",
              status: "done",
              labels: [L.phase0, L.Frontend],
            },
            {
              title: "Seed one org + space memberships",
              description: "Seed script creates demo org and space memberships.",
              status: "done",
              labels: [L.phase0, L.Backend],
            },
          ],
        },
        {
          title: "Shared composer vocabulary",
          description:
            "One composer for post / reply / wall / space-post. Consolidate duplicated composer surfaces.",
          status: "done",
          labels: [L.phase0, L.Frontend, L.UX],
          children: [
            {
              title: "Inventory all composer entry points",
              description: "Post, reply, wall, space-post composers and their prop differences.",
              status: "done",
              labels: [L.phase0, L.Frontend],
            },
            {
              title: "Unify into one composer component API",
              description: "Shared validation, submit path, and demo/product write routing.",
              status: "done",
              labels: [L.phase0, L.Frontend],
            },
          ],
        },
        {
          title: "Prune flash experiments + archive LinkedOrgs mock",
          description: `Flash lab is demo-only. LinkedOrgs mock archived. Walls stay as a real product surface (\`wallOwnerId\` already in schema).`,
          status: "done",
          labels: [L.phase0, L.Frontend],
          children: [
            {
              title: "Gate flash-experiments route behind demo mode",
              description: "Hide lab in product builds; keep visible in demo.",
              status: "done",
              labels: [L.phase0, L.Frontend],
            },
            {
              title: "Archive LinkedOrgs mock page",
              description: "Remove dead mock surface from product navigation.",
              status: "done",
              labels: [L.phase0, L.Frontend],
            },
            {
              title: "Confirm walls remain a product surface",
              description: "wallOwnerId path stays; not treated as experiment.",
              status: "done",
              labels: [L.phase0, L.Feature],
            },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // PHASE 1 — auth + real write path (DONE)
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Phase 1 — Auth + real write path",
      description: `**Exit criteria:** a real person can log in on the product deployment, post, reply, mark read — all persisted; demo deployment behavior unchanged.

Tracker: all 1.x items checked including invite-gated activation.`,
      status: "done",
      priority: 2,
      labels: [L.phase1, L.Feature],
      milestone: M.p1,
      children: [
        {
          title: "Clerk product authentication",
          description: `Replace shoo.dev customJwt with Clerk Convex integration.
- \`convex/auth.config.ts\` → Clerk JWT template \`convex\`
- Add \`@clerk/clerk-react\`; remove \`@shoojs/react\`
- Keep \`authUsers.ts\` as identity→users resolution (tokenIdentifier)
- Demo: do not load Clerk; keep persona switcher`,
          status: "done",
          labels: [L.phase1, L.Backend, L.Frontend],
          children: [
            {
              title: "Wire Clerk Convex JWT template",
              description: "auth.config.ts + Clerk dashboard JWT template named convex.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
            {
              title: "ProductSessionProvider + ClerkProvider (product only)",
              description: "Skip Clerk when VITE_DEMO=true; mount switcher instead.",
              status: "done",
              labels: [L.phase1, L.Frontend],
            },
            {
              title: "Reject unauthenticated writes in product mode",
              description: "Every mutation calls ctx.auth.getUserIdentity().",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
          ],
        },
        {
          title: "Dual write path: Convex (product) vs overlay (demo)",
          description: `Product writes hit Convex. Demo keeps session overlay (zero-persistence visitor sandbox).
store.tsx becomes thin interface with two implementations selected by demo mode.`,
          status: "done",
          labels: [L.phase1, L.Frontend, L.Backend],
          children: [
            {
              title: "Product path: mutations go straight to Convex",
              description: "No overlay merge for authenticated users.",
              status: "done",
              labels: [L.phase1, L.Frontend],
            },
            {
              title: "Demo path: keep session overlay as-is",
              description: "Visitor writes vanish on refresh; backend stays read-only for visitors.",
              status: "done",
              labels: [L.phase1, L.Frontend],
            },
            {
              title: "Abstract write interface (ConvexWrites / OverlayWrites)",
              description: "Selected by isDemo; avoid duplicated call sites sprawling.",
              status: "done",
              labels: [L.phase1, L.Frontend],
            },
          ],
        },
        {
          title: "User lifecycle: profile + admin roles",
          description: "Signup creates users doc; profile editing; admin role assignment.",
          status: "done",
          labels: [L.phase1, L.Feature],
          children: [
            {
              title: "ensureViewerUser creates / syncs users row",
              description: "Name/title/avatar from identity; tokenIdentifier mapping.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
            {
              title: "Profile edit UI (self-serve name/avatar)",
              description: "Title later becomes admin-managed after onboarding (see invite plan).",
              status: "done",
              labels: [L.phase1, L.Frontend],
            },
            {
              title: "Admin role assignment path",
              description: "Admin-only ops gated by role.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
          ],
        },
        {
          title: "Access control on every query/mutation",
          description: "Author checks, space membership, admin-only, org-scoped access.",
          status: "done",
          labels: [L.phase1, L.Backend],
          children: [
            {
              title: "Org-scoped query filters everywhere",
              description: "Even with single org, all reads filter by orgId.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
            {
              title: "Author / membership checks on writes",
              description: "posts, replies, spaces, admin surfaces.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
          ],
        },
        {
          title: "Invite-gated activation + blocking profile onboarding",
          description: `Completed implementation record: \`docs/plan/invite-gated-signup.md\`.

Cannot use product without redeeming invite. After activation, blocking profile modal (name + avatar + job title). Title is job title not role; admin-managed after onboarding.`,
          status: "done",
          priority: 2,
          labels: [L.phase1, L.Feature, L.UX],
          children: [
            {
              title: "Schema: user status + profileCompletedAt + avatar fields",
              description:
                "pending|active status, profileCompletedAt, avatarStorageId/Url, providerAvatarUrl, avatarRemoved.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
            {
              title: "Backend: ensureActiveViewerUser + enforcement sweep",
              description:
                "Pending users blocked from content writes; exceptions for redeem/me/completeProfile.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
            {
              title: "access.redeemInvite activates pending → active",
              description: "Only path from pending to active; increments usedCount.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
            {
              title: "users.me / completeProfile / avatar upload APIs",
              description: "Pinned API contract from invite-gated-signup.md.",
              status: "done",
              labels: [L.phase1, L.Backend],
            },
            {
              title: "Provider photo import + remove/useProvider actions",
              description: "Avatar amendment 2026-07-08: default provider pfp; user can remove to initials.",
              status: "done",
              labels: [L.phase1, L.Frontend, L.Backend],
            },
            {
              title: "ProfileDialog (onboarding + edit modes)",
              description: "Blocking onboarding modal; edit mode from sidebar.",
              status: "done",
              labels: [L.phase1, L.Frontend, L.UX],
            },
            {
              title: "Join flow: /join/$code + localStorage invite carry",
              description: "postwork.inviteCode survives sign-in; AccessOnboarding gate.",
              status: "done",
              labels: [L.phase1, L.Frontend],
            },
            {
              title: "Admin: invites, access requests, setTitle, audit log",
              description: "Admin panel manages invites and job titles.",
              status: "done",
              labels: [L.phase1, L.Backend, L.Frontend],
            },
            {
              title: "Deployed Clerk + browser QA for invite/onboarding",
              description:
                "Manual QA checklist from invite plan not yet recorded as complete. Covers invite activation, profile modal, grandfathered accounts.",
              status: "todo",
              priority: 2,
              labels: [L.phase1, L.qa],
            },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // PHASE 2 — multi-tenancy
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Phase 2 — Multi-tenancy groundwork",
      description: `Decision Q3=b: defensive middle ground — schema now, UX later.

Done: orgs table, org-prefixed indexes, default seeded org, org-scoped queries.
Open: true multi-org product flow (see \`docs/organizations.md\`).`,
      status: "inProgress",
      priority: 3,
      labels: [L.phase2, L.Feature],
      milestone: M.p2,
      children: [
        {
          title: "orgs table + orgId columns + indexes",
          description: "posts, spaces, users, postReads carry orgId; org-prefixed indexes including search filterFields.",
          status: "done",
          labels: [L.phase2, L.Backend],
        },
        {
          title: "Seed default org + org-scoped query paths",
          description: "DEFAULT_ORG_SLUG = postwork-demo via getDefaultOrgId / ensureDefaultOrg.",
          status: "done",
          labels: [L.phase2, L.Backend],
        },
        {
          title: "True multi-org product flow",
          description: `Future milestone — not a small UI switcher. Gap list in \`docs/organizations.md\`.

Non-goals for first milestone: billing, org branding, cross-org. First milestone: sign up → create org → invite into *your* org.`,
          status: "backlog",
          priority: 4,
          labels: [L.phase2, L.Feature, L.Backend],
          milestone: M.p2,
          children: [
            {
              title: "Org creation flow (name → slug, creator becomes admin)",
              description:
                "Signed-up user with no org creates one. Today getDefaultOrgId throws if default missing.",
              status: "backlog",
              labels: [L.phase2, L.Backend, L.Frontend],
            },
            {
              title: "Replace getDefaultOrgId / ensureDefaultOrg callsites",
              description:
                "Resolve org from authenticated user or explicit org context. Main refactor.",
              status: "backlog",
              labels: [L.phase2, L.Backend],
            },
            {
              title: "Backfill orgId then make it required",
              description: "Widen → migrate → narrow. Optional only for legacy rows today.",
              status: "backlog",
              labels: [L.phase2, L.Backend],
            },
            {
              title: "Decide membership model (1 user-row-per-org vs orgMemberships)",
              description:
                "Current auth mapping by_org_id_and_token_identifier assumes 1 row per org (Slack-like).",
              status: "backlog",
              labels: [L.phase2, L.Research, L.Backend],
            },
            {
              title: "Invites carry target org (stop assuming default)",
              description: "/join/$code already resolves invite; redemption must use invite.orgId.",
              status: "backlog",
              labels: [L.phase2, L.Backend],
            },
            {
              title: "Org switcher / org-scoped routing",
              description: "Either /o/$orgSlug/app/... or session-selected org. Needed only when multi-membership exists.",
              status: "backlog",
              labels: [L.phase2, L.Frontend],
            },
            {
              title: "Seed + demo keep postwork-demo; org create is product-only",
              description: "Demo mode unchanged; org creation behind Clerk product mode.",
              status: "backlog",
              labels: [L.phase2, L.Backend],
            },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // PHASE 3 — product hardening
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Phase 3 — Product hardening",
      description: `Rate limits, validation, pagination, images, moderation mostly done.
Open: external error reporting, priority-aware outbound notifications, deployed QA.`,
      status: "inProgress",
      priority: 2,
      labels: [L.phase3, L.Feature],
      milestone: M.p3,
      children: [
        {
          title: "Per-user rate limiting (mutations + AI)",
          description: "Convex rate-limiter component on mutation and AI paths.",
          status: "done",
          labels: [L.phase3, L.Backend],
        },
        {
          title: "Shared input limits + Zod validation",
          description: "Post/reply body size, title length via shared zod schemas.",
          status: "done",
          labels: [L.phase3, L.Backend, L.Frontend],
        },
        {
          title: "Cursor pagination for feed and replies",
          description: "Replace unbounded feed/reply queries before real data volume.",
          status: "done",
          labels: [L.phase3, L.Backend, L.Frontend],
        },
        {
          title: "Image attachments via Convex storage (product mode)",
          description: "Decision Q5=b: images only in v1. Paste/drop screenshots; size limits. Generic files deferred. Disabled in demo (overlay can't hold files).",
          status: "done",
          labels: [L.phase3, L.Feature, L.Frontend, L.Backend],
          children: [
            {
              title: "Upload URL + storage mutation path",
              description: "Convex storage generateUploadUrl + attach to posts/replies.",
              status: "done",
              labels: [L.phase3, L.Backend],
            },
            {
              title: "Composer image paste/drop UI",
              description: "Product-only affordance; size/type validation.",
              status: "done",
              labels: [L.phase3, L.Frontend],
            },
            {
              title: "Render attachments in post/reply views",
              description: "Stable Convex file URLs.",
              status: "done",
              labels: [L.phase3, L.Frontend],
            },
          ],
        },
        {
          title: "Moderation / admin operations",
          description:
            "Edit/delete posts, deactivate/reactivate users, invites, access requests, audit history.",
          status: "done",
          labels: [L.phase3, L.Feature, L.Backend, L.Frontend],
          children: [
            {
              title: "Edit / delete posts and replies (admin + author rules)",
              description: "Moderation mutations with authz.",
              status: "done",
              labels: [L.phase3, L.Backend],
            },
            {
              title: "Deactivate / reactivate users",
              description: "Admin panel user lifecycle.",
              status: "done",
              labels: [L.phase3, L.Backend],
            },
            {
              title: "Audit history for admin actions",
              description: "Structured audit entries for title changes, deactivations, etc.",
              status: "done",
              labels: [L.phase3, L.Backend],
            },
          ],
        },
        {
          title: "Observability: structured logs + ErrorBoundary + external reporting",
          description: `Partial: Convex logInfo coverage + React ErrorBoundary exist.
Missing: external error reporting (Sentry or similar). Plausible stays for demo domain.`,
          status: "inProgress",
          priority: 2,
          labels: [L.phase3, L.DevOps, L.Frontend],
          children: [
            {
              title: "Structured Convex logInfo on critical paths",
              description: "Existing coverage — keep current when adding surfaces.",
              status: "done",
              labels: [L.phase3, L.Backend],
            },
            {
              title: "React ErrorBoundary in app shell",
              description: "src/components/ErrorBoundary.tsx present.",
              status: "done",
              labels: [L.phase3, L.Frontend],
            },
            {
              title: "Add external error reporting (Sentry or equivalent)",
              description:
                "Client + optional Convex log stream. Product + demo deployments. Do not break offline local dev.",
              status: "todo",
              priority: 2,
              labels: [L.phase3, L.DevOps, L.Frontend],
            },
            {
              title: "Verify Plausible on demo domain only",
              description: "VITE_PLAUSIBLE_DOMAIN=postwork.pcstyle.dev; product domain policy TBD.",
              status: "todo",
              labels: [L.phase3, L.Analytics, L.DevOps],
            },
          ],
        },
        {
          title: "Priority-aware outbound notifications",
          description: `In-app unread is baseline (done). Need outbound email or web-push that respects priority and avoids notification soup.

Decide delivery semantics + unsubscribe/preferences **before** choosing a provider.

Product thesis: triage, not notification noise. See \`docs/next.md\` §2.`,
          status: "todo",
          priority: 2,
          labels: [L.phase3, L.Feature, L.Backend],
          milestone: M.p3,
          children: [
            {
              title: "Define delivery semantics (what triggers, priority gates)",
              description:
                "When to email/push vs stay in-app only. Quiet hours? Digest vs immediate for urgent priority?",
              status: "todo",
              priority: 2,
              labels: [L.phase3, L.Research],
            },
            {
              title: "User notification preferences + unsubscribe model",
              description: "Product-mode preferences storage; respect priority.",
              status: "todo",
              labels: [L.phase3, L.Backend, L.Frontend],
            },
            {
              title: "Choose provider (email vs web-push) and integrate",
              description: "After semantics locked. Resend/email or web-push VAPID.",
              status: "backlog",
              labels: [L.phase3, L.Integration, L.Backend],
            },
            {
              title: "Priority-aware digest composer",
              description: "Compose unread + priority into outbound payload without noise.",
              status: "backlog",
              labels: [L.phase3, L.Backend],
            },
            {
              title: "Demo mode: notifications disabled / no-op",
              description: "Public demo must not send real outbound messages.",
              status: "backlog",
              labels: [L.phase3, L.Backend],
            },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // PHASE 4 — agent catch-up loop (THE DIFFERENTIATOR)
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Phase 4 — Agent catch-up loop (differentiator)",
      description: `Core product thesis feature set.

Done: persisted agentTasks, isAgent users, server-created result replies.
Open: summary staleness, per-user catch-up digest, real external connectors.

Prioritized as #1 in \`docs/next.md\`.`,
      status: "inProgress",
      priority: 1,
      labels: [L.phase4, L.Feature],
      milestone: M.p4,
      children: [
        {
          title: "Persisted agentTasks + /app/agents from Convex",
          description:
            "agentTasks table real; task lifecycle rows; /agents page reads Convex. Runner is still internal simulated AI flow.",
          status: "done",
          labels: [L.phase4, L.Backend, L.Frontend],
          children: [
            {
              title: "Schema + mutations for agent task lifecycle",
              description: "Create, run, complete, fail; results attached to posts.",
              status: "done",
              labels: [L.phase4, L.Backend],
            },
            {
              title: "/app/agents page backed by Convex",
              description: "Replace in-memory agentTasks.tsx for product path.",
              status: "done",
              labels: [L.phase4, L.Frontend],
            },
          ],
        },
        {
          title: "First-class isAgent users + server-created replies",
          description:
            "Agents post replies via authenticated server-side actions. Audit trail preserved. Runner remains simulated until connectors.",
          status: "done",
          labels: [L.phase4, L.Backend],
        },
        {
          title: "Summary staleness after replies",
          description: `Make a post summary visibly stale when replies advance \`lastActivityAt\` beyond \`summaryUpdatedAt\`.

Explain what context the summary covers. Decide whether opt-in Convex cron refresh is useful after the manual path is clear.

Areas: convex/ai.ts, posts.ts, replies.ts, AgentSummary.tsx.

\`docs/next.md\` §1 first half.`,
          status: "todo",
          priority: 1,
          labels: [L.phase4, L.Feature, L.Frontend, L.Backend],
          children: [
            {
              title: "Compute isStale from lastActivityAt vs summaryUpdatedAt",
              description: "Backend projection or client derive; include in post feed/detail payloads.",
              status: "todo",
              priority: 1,
              labels: [L.phase4, L.Backend],
            },
            {
              title: "Stale badge + coverage copy in AgentSummary UI",
              description:
                "Visibly stale; explain which replies/context the summary covers (e.g. 'through reply N' or timestamp).",
              status: "todo",
              priority: 1,
              labels: [L.phase4, L.Frontend, L.UX],
            },
            {
              title: "Manual regenerate path remains clear + rate-limited",
              description: "Generate/Regenerate button; friendly configure-provider message without key.",
              status: "todo",
              labels: [L.phase4, L.Frontend, L.Backend],
            },
            {
              title: "Evaluate opt-in Convex cron auto-refresh",
              description:
                "Only after manual path is clear. Document decision; implement only if useful.",
              status: "backlog",
              labels: [L.phase4, L.Backend, L.Research],
            },
          ],
        },
        {
          title: "Per-user catch-up digest",
          description: `**The product thesis, not a generic notification feed.**

Unread posts + priorities composed with summaries into one focused return-to-work view.

\`docs/next.md\` §1 second half · Phase 4.4.`,
          status: "todo",
          priority: 1,
          labels: [L.phase4, L.Feature, L.Frontend, L.Backend, L.UX],
          children: [
            {
              title: "Define digest composition rules",
              description:
                "Ordering: priority first? recency? unread-only? How summaries fold in. Write the product rules before UI.",
              status: "todo",
              priority: 1,
              labels: [L.phase4, L.Research, L.UX],
            },
            {
              title: "Backend query: catch-up digest for viewer",
              description:
                "Compose unread + priority + summary staleness into one payload. Org-scoped, authz-checked.",
              status: "todo",
              priority: 1,
              labels: [L.phase4, L.Backend],
            },
            {
              title: "Catch-up digest surface (route + UI)",
              description:
                "New focused return-to-work view. Calm, triage-at-a-glance. Match design.md.",
              status: "todo",
              priority: 1,
              labels: [L.phase4, L.Frontend, L.UX],
            },
            {
              title: "Empty / all-caught-up states",
              description: "Quiet confidence, no engagement bait.",
              status: "todo",
              labels: [L.phase4, L.Frontend, L.UX],
            },
            {
              title: "Demo seed narrative includes catch-up scenarios",
              description: "Seed posts/priorities/unreads that make the digest obviously useful.",
              status: "todo",
              labels: [L.phase4, L.Backend],
            },
          ],
        },
        {
          title: "External agent + integration connectors",
          description: `Only after catch-up loop works end-to-end.

Design explicit connectors for real coding agents and inbound sources (GitHub, deploy events). Preserve task lifecycle + agent-user audit trail — do not bypass with direct posts.

Areas: convex/agentTasks.ts, replies.ts, agent task UI, new connector boundaries.

\`docs/next.md\` §5 · Phase 4.5.`,
          status: "backlog",
          priority: 4,
          labels: [L.phase4, L.Integration, L.Backend],
          children: [
            {
              title: "Connector boundary design (auth, audit, task lifecycle)",
              description: "How external agents become isAgent users; how results become replies.",
              status: "backlog",
              labels: [L.phase4, L.Research, L.Backend],
            },
            {
              title: "GitHub webhook → post/task ingestion",
              description: "Inbound events become posts or agent tasks, not freeform spam.",
              status: "backlog",
              labels: [L.phase4, L.Integration],
            },
            {
              title: "Deploy event → post ingestion",
              description: "Optional connector after GitHub path proves the model.",
              status: "backlog",
              labels: [L.phase4, L.Integration],
            },
            {
              title: "Real coding-agent runner replacing simulated AI flow",
              description: "Swap internal simulator for real agent connector; keep lifecycle.",
              status: "backlog",
              labels: [L.phase4, L.Backend],
            },
          ],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // PHASE 5 — demo-mode productization
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Phase 5 — Demo-mode productization",
      description: `Make the public demo intentional. Flash lab already demo-only; remaining work is communicating the sandbox and keeping in-progress work out of product.

Done: README + live-doc sync.
Open: banner, reseed cadence, feature-flag/lab policy.

\`docs/next.md\` §3.`,
      status: "inProgress",
      priority: 2,
      labels: [L.phase5, L.Feature],
      milestone: M.p5,
      children: [
        {
          title: "Quiet public-demo banner",
          description:
            "On-brand: \"public demo — data resets, pick a teammate\". Lowercase chrome, wine accent, no hype. App chrome only when isDemo.",
          status: "todo",
          priority: 2,
          labels: [L.phase5, L.Frontend, L.UX],
          children: [
            {
              title: "Design + implement demo banner component",
              description: "Match docs/design.md. Dismissible? Persistent strip?",
              status: "todo",
              labels: [L.phase5, L.Frontend, L.UX],
            },
            {
              title: "Mount banner in demo app shell only",
              description: "Never in product mode.",
              status: "todo",
              labels: [L.phase5, L.Frontend],
            },
          ],
        },
        {
          title: "Reseed cadence + current seed narrative",
          description:
            "Define cron or manual reseed. Keep seed narrative current with real features so demo shows development progress.",
          status: "todo",
          priority: 3,
          labels: [L.phase5, L.Backend, L.DevOps],
          children: [
            {
              title: "Document reseed SOP (who, when, how)",
              description: "`bunx convex run --prod seed:run` against demo deployment only.",
              status: "todo",
              labels: [L.phase5, L.DevOps],
            },
            {
              title: "Refresh seed content to showcase catch-up + priorities",
              description: "Narrative posts that make the thesis self-evident.",
              status: "todo",
              labels: [L.phase5, L.Backend],
            },
            {
              title: "Optional scheduled reseed job (demo deployment only)",
              description: "Only if manual SOP is too easy to forget.",
              status: "backlog",
              labels: [L.phase5, L.DevOps],
            },
          ],
        },
        {
          title: "Feature-flag / lab policy",
          description:
            "Beyond existing demo-only flash lab: show in-progress features in demo behind lab affordance; keep off in product until ready.",
          status: "todo",
          priority: 3,
          labels: [L.phase5, L.Frontend, L.Backend],
          children: [
            {
              title: "Define flag inventory and ownership",
              description: "Which features are lab vs product. Document in README or docs/.",
              status: "todo",
              labels: [L.phase5, L.Research],
            },
            {
              title: "Implement lightweight flag helper (demo vs product)",
              description: "Build on demoMode.ts; avoid over-engineering.",
              status: "todo",
              labels: [L.phase5, L.Frontend],
            },
          ],
        },
        {
          title: "README + live-doc synchronization",
          description: "Split run-the-demo vs run-the-product docs; fix drifted schema claims. Done 2026-07-10 cleanup.",
          status: "done",
          labels: [L.phase5, L.Improvement],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // VERIFICATION / QA
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Deployed product experience validation",
      description: `\`docs/next.md\` §4.

Add external error reporting (covered under Phase 3 observability).
Run deployed browser + accessibility QA across demo and Clerk-gated product flows:
invite activation, onboarding, keyboard/focus, narrow layouts, failure states.

Builds: \`bun run build\` and \`VITE_DEMO=false bun run build\` green as of 2026-07-10 docs cleanup.`,
      status: "todo",
      priority: 2,
      labels: [L.qa, L.Feature],
      milestone: M.qa,
      children: [
        {
          title: "Record bun run build green after each implementation change",
          description: "Canonical check: tsc -b && vite build. Covers convex via generated api.d.ts.",
          status: "todo",
          labels: [L.qa, L.DevOps],
        },
        {
          title: "Record VITE_DEMO=false production build green",
          description: "Product-mode build must stay green.",
          status: "todo",
          labels: [L.qa, L.DevOps],
        },
        {
          title: "Deployed browser QA: demo flow (persona switcher, feed, post, reply)",
          description: "Public demo on postwork.pcstyle.dev.",
          status: "todo",
          priority: 2,
          labels: [L.qa, L.Frontend],
        },
        {
          title: "Deployed browser QA: Clerk product (login, invite, onboarding)",
          description: "Invite activation, blocking profile, grandfathered accounts.",
          status: "todo",
          priority: 2,
          labels: [L.qa, L.Frontend],
        },
        {
          title: "Accessibility QA: keyboard, focus, contrast, reduced motion",
          description:
            "Pragmatic AA floor from product.md. Priority states by label+dot not color alone.",
          status: "todo",
          labels: [L.qa, L.UX],
        },
        {
          title: "Narrow layout / mobile smoke pass",
          description: "Feed, post detail, composer, admin basics.",
          status: "todo",
          labels: [L.qa, L.Frontend],
        },
        {
          title: "Failure states: offline, Convex errors, AI provider missing",
          description: "Friendly messages; ErrorBoundary; configure-provider copy.",
          status: "todo",
          labels: [L.qa, L.Frontend],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // DESIGN SYSTEM (ongoing reference, not all open work)
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Design system adherence (pcstyle.dev-derived)",
      description: `Canonical: \`docs/design.md\` · product context: \`docs/product.md\`.

Warm near-black surfaces, deep wine accent, Inter for product UI, mono for code/data, small radii, lowercase chrome, no emoji. Muted priority colors from \`src/lib/format.ts\`.

Use impeccable skill for critique/polish passes when shipping surfaces.`,
      status: "inProgress",
      priority: 3,
      labels: [L.UX, L.Improvement],
      milestone: M.p5,
      children: [
        {
          title: "Keep docs/design.md in sync with shipped UI tokens",
          description: "When tokens change, update design.md same PR.",
          status: "todo",
          labels: [L.UX],
        },
        {
          title: "Critique pass: catch-up digest surface (when built)",
          description: "impeccable critique before calling digest done.",
          status: "backlog",
          labels: [L.UX, L.phase4],
        },
        {
          title: "Critique pass: demo banner (when built)",
          description: "Quiet confidence, not marketing chrome.",
          status: "backlog",
          labels: [L.UX, L.phase5],
        },
      ],
    },

    // ═══════════════════════════════════════════════════════════════
    // INFRA / OPS
    // ═══════════════════════════════════════════════════════════════
    {
      title: "Deployment & dual-mode ops",
      description: `Two Convex deployments, one repo.
- postwork.pcstyle.dev → demo Convex, DEMO=true, seeded
- product domain → production Convex, DEMO unset, Clerk required
Vercel injects VITE_CONVEX_URL; set CONVEX_DEPLOY_KEY + VITE_PLAUSIBLE_DOMAIN.

Branch policy: beta is active main; do not touch main until demo→product complete.`,
      status: "inProgress",
      priority: 3,
      labels: [L.DevOps],
      milestone: M.qa,
      children: [
        {
          title: "Demo Convex deployment configured (DEMO=true, seedable)",
          description: "Public demo backend isolated from product data.",
          status: "done",
          labels: [L.DevOps],
        },
        {
          title: "Product Convex deployment + Clerk keys",
          description: "DEMO unset; Clerk production/dev instances.",
          status: "done",
          labels: [L.DevOps],
        },
        {
          title: "Vercel project env matrix documented",
          description: "VITE_DEMO, VITE_CONVEX_URL, CONVEX_DEPLOY_KEY, Plausible domain.",
          status: "todo",
          labels: [L.DevOps],
        },
        {
          title: "AI provider env vars on Convex (product)",
          description:
            "AI_PROVIDER + keys (openai/gateway/openrouter/pioneer). Seed summaries use seed/baked so demo works without keys.",
          status: "todo",
          labels: [L.DevOps, L.Backend],
        },
        {
          title: "Protect against dual convex dev on anonymous deployment",
          description:
            "Known footgun documented in AGENTS.md. Ops note only unless tooling added.",
          status: "done",
          labels: [L.DevOps],
        },
      ],
    },
  ];
}

const STATE_MAP = {
  done: STATE.done,
  inProgress: STATE.inProgress,
  todo: STATE.todo,
  backlog: STATE.backlog,
  inReview: STATE.inReview,
};

async function createTree(nodes, ctx, parentId = null) {
  for (const node of nodes) {
    const stateId = STATE_MAP[node.status] ?? STATE.todo;
    const labelIds = (node.labels ?? []).filter(Boolean);
    const milestoneId = node.milestone ?? ctx.defaultMilestone ?? undefined;

    const issue = await createIssue({
      title: node.title,
      description: node.description ?? "",
      projectId: ctx.projectId,
      milestoneId: parentId ? node.milestone : milestoneId, // parents get milestone; children inherit via project
      parentId,
      stateId,
      priority: node.priority ?? (parentId ? 3 : 2),
      labelIds,
    });

    // Parent issues that are fully done should stay Done even with children;
    // Linear may auto-move parents — we re-assert state after children if needed.
    if (node.children?.length) {
      await createTree(node.children, ctx, issue.id);
      // Re-assert parent state (Linear can change parent based on children)
      if (node.status === "done" || node.status === "inProgress" || node.status === "todo") {
        try {
          await gql(
            `mutation($id: String!, $input: IssueUpdateInput!) {
              issueUpdate(id: $id, input: $input) { success }
            }`,
            { id: issue.id, input: { stateId } },
          );
        } catch {
          // ignore
        }
      }
    }
  }
}

async function main() {
  console.log("=== Postwork Linear setup ===\n");

  // Labels
  console.log("Creating labels…");
  const labels = {
    ...EXISTING_LABELS,
    phase0: await ensureLabel("Phase 0", "#BEC2C8"),
    phase1: await ensureLabel("Phase 1", "#4EA7FC"),
    phase2: await ensureLabel("Phase 2", "#26B5CE"),
    phase3: await ensureLabel("Phase 3", "#F2C94C"),
    phase4: await ensureLabel("Phase 4", "#BB87FC"),
    phase5: await ensureLabel("Phase 5", "#EB5757"),
    qa: await ensureLabel("QA", "#95A2B3"),
    catchup: await ensureLabel("Catch-up", "#7A1F2B"),
  };
  // also try to add Catch-up to phase4 issues later via label — stored as catchup

  // Project
  console.log("\nCreating project…");
  const project = await createProject();

  // Milestones
  console.log("\nCreating milestones…");
  const milestones = {
    p0: await createMilestone(
      project.id,
      "Phase 0 — Consolidation",
      "Demo switch, durable spaces, shared composer, prune experiments. COMPLETE.",
      1,
    ),
    p1: await createMilestone(
      project.id,
      "Phase 1 — Auth + writes",
      "Clerk, dual write path, user lifecycle, access control, invite-gated onboarding. COMPLETE (deployed QA open).",
      2,
    ),
    p2: await createMilestone(
      project.id,
      "Phase 2 — Multi-tenancy",
      "Org schema done. True multi-org product flow deferred (organizations.md).",
      3,
    ),
    p3: await createMilestone(
      project.id,
      "Phase 3 — Hardening",
      "Rate limits, validation, pagination, images, moderation done. Notifications + external errors open.",
      4,
    ),
    p4: await createMilestone(
      project.id,
      "Phase 4 — Catch-up loop",
      "Differentiator: summary staleness + per-user digest. Connectors after loop works.",
      5,
    ),
    p5: await createMilestone(
      project.id,
      "Phase 5 — Demo productization",
      "Banner, reseed, lab policy. README sync done.",
      6,
    ),
    qa: await createMilestone(
      project.id,
      "Verification & QA",
      "Deployed browser/a11y QA, build gates, dual-mode ops.",
      7,
    ),
  };

  // Issues
  console.log("\nCreating issues (this takes a minute)…");
  const tree = buildTree(labels, milestones);

  // Attach catch-up label to phase 4 catch-up parents by including in labels array where relevant
  // (already using phase4 labels; enhance key nodes)
  const enhance = (nodes) => {
    for (const n of nodes) {
      if (
        n.title.toLowerCase().includes("catch-up") ||
        n.title.toLowerCase().includes("staleness") ||
        n.title.toLowerCase().includes("digest")
      ) {
        n.labels = [...(n.labels ?? []), labels.catchup];
      }
      if (n.children) enhance(n.children);
    }
  };
  enhance(tree);

  await createTree(tree, { projectId: project.id });

  // Project update note
  try {
    await gql(
      `mutation($input: ProjectUpdateCreateInput!) {
        projectUpdateCreate(input: $input) {
          success
          projectUpdate { id }
        }
      }`,
      {
        input: {
          projectId: project.id,
          body: `## Linear bootstrap (2026-07-10)

Imported from repo roadmap:
- \`docs/next.md\`
- \`docs/plan/demo-to-product-progress.md\`
- \`docs/plan/demo-to-product.md\`
- \`docs/organizations.md\`

**Done** items are marked Done (Phases 0–1, multi-tenancy groundwork, most of hardening, agentTasks persistence, README sync).
**In progress** parents: Phase 2/3/4/5 umbrellas + observability + design system + ops.
**Active focus (Todo, P1):** summary staleness → catch-up digest → notifications → demo banner → deployed QA.

Sub-issues are the unit of work — not phase parents.`,
          health: "onTrack",
        },
      },
    );
    console.log("\nProject status update posted.");
  } catch (e) {
    console.warn("Project update skipped:", e.message);
  }

  // Summary counts
  const summary = await gql(
    `query($projectId: ID!) {
      project(id: $projectId) {
        name
        url
        issues(first: 250) {
          nodes { state { name type } }
        }
      }
    }`,
    { projectId: project.id },
  );

  const counts = {};
  for (const i of summary.project.issues.nodes) {
    const n = i.state.name;
    counts[n] = (counts[n] ?? 0) + 1;
  }

  console.log("\n=== Done ===");
  console.log(`Project: ${summary.project.url}`);
  console.log("Issue counts by state:", counts);
  console.log(`Total issues: ${summary.project.issues.nodes.length}`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message || e);
  process.exit(1);
});
