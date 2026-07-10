#!/usr/bin/env bun
/**
 * Pull the live Linear state for the Postwork project.
 *
 * Outputs a markdown roadmap (default) or JSON (--json) that an AI agent
 * can read to understand the current project status without browsing Linear.
 *
 * Usage:
 *   LINEAR_API_KEY=lin_api_... bun run scripts/linear-pull.mjs
 *   LINEAR_API_KEY=lin_api_... bun run scripts/linear-pull.mjs --json
 *   LINEAR_API_KEY=lin_api_... bun run scripts/linear-pull.mjs --milestone "Phase 4 — Catch-up loop"
 *
 * Get your API key at https://linear.app/settings/account/security
 * Store it in .env (gitignored) as LINEAR_API_KEY=lin_api_...
 */

const API = "https://api.linear.app/graphql";
const KEY = process.env.LINEAR_API_KEY;

if (!KEY) {
  console.error(
    "LINEAR_API_KEY is required. Get one at https://linear.app/settings/account/security",
  );
  console.error(
    "Store it in .env as LINEAR_API_KEY=lin_api_... (the file is gitignored).",
  );
  process.exit(1);
}

const PROJECT_SLUG = "postwork";
const OUTPUT_JSON = process.argv.includes("--json");
const MILESTONE_FILTER = (() => {
  const idx = process.argv.indexOf("--milestone");
  return idx >= 0 ? process.argv[idx + 1] : null;
})();

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

async function fetchAllIssues(projectId) {
  const allIssues = [];
  let cursor = null;
  let hasNext = true;

  while (hasNext) {
    const data = await gql(
      `query($projectId: ID!, $after: String) {
        project(id: $projectId) {
          issues(first: 100, after: $after, orderBy: FIELD, orderDirection: ASC) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              identifier
              title
              url
              priority
              estimate
              dueDate
              createdAt
              updatedAt
              state { name type }
              assignee { name }
              priorityLabel
              labels(first: 20) { nodes { name color } }
              projectMilestone { id name }
              parent { id identifier title }
              children(first: 100) { nodes { id identifier title state { name } } }
              relations {
                nodes {
                  type
                  issue { id identifier title }
                }
              }
            }
          }
        }
      }`,
      { projectId, after: cursor },
    );

    const conn = data.project.issues;
    allIssues.push(...conn.nodes);
    hasNext = conn.pageInfo.hasNextPage;
    cursor = conn.pageInfo.endCursor;
  }

  return allIssues;
}

async function main() {
  // Fetch the project
  const projectData = await gql(
    `query($slug: String!) {
      projectBySlug(slug: $slug) {
        id
        name
        url
        state
        targetDate
        description
        milestones(first: 50, orderBy: FIELD, orderDirection: ASC) {
          nodes {
            id
            name
            description
            targetDate
            sortOrder
          }
        }
        labels(first: 50) { nodes { id name color } }
      }
    }`,
    { slug: PROJECT_SLUG },
  );

  const project = projectData.projectBySlug;
  if (!project) {
    console.error(`Project with slug "${PROJECT_SLUG}" not found.`);
    console.error("Check that your LINEAR_API_KEY has access to the workspace.");
    process.exit(1);
  }

  // Fetch all issues (paginated)
  const issues = await fetchAllIssues(project.id);

  // Build milestone lookup
  const milestones = project.milestones.nodes;

  // Build issue lookup for dependency resolution
  const issueMap = new Map(issues.map((i) => [i.id, i]));

  // Build blocked-by map from relations
  const blockedBy = new Map();
  for (const issue of issues) {
    for (const rel of issue.relations.nodes) {
      if (rel.type === "BLOCKED_BY") {
        if (!blockedBy.has(issue.id)) blockedBy.set(issue.id, []);
        blockedBy.get(issue.id).push(rel.issue);
      }
    }
  }

  // JSON output
  if (OUTPUT_JSON) {
    const output = {
      project: {
        name: project.name,
        url: project.url,
        state: project.state,
        targetDate: project.targetDate,
        description: project.description,
      },
      milestones: milestones.map((m) => ({
        name: m.name,
        description: m.description,
        targetDate: m.targetDate,
      })),
      labels: project.labels.nodes.map((l) => ({
        name: l.name,
        color: l.color,
      })),
      issues: issues.map((i) => ({
        identifier: i.identifier,
        title: i.title,
        url: i.url,
        state: i.state?.name,
        stateType: i.state?.type,
        priority: i.priorityLabel,
        assignee: i.assignee?.name,
        milestone: i.projectMilestone?.name,
        parent: i.parent
          ? `${i.parent.identifier} — ${i.parent.title}`
          : null,
        children: i.children.nodes.map((c) => ({
          identifier: c.identifier,
          title: c.title,
          state: c.state?.name,
        })),
        blockedBy: (blockedBy.get(i.id) || []).map((b) => `${b.identifier} — ${b.title}`),
        labels: i.labels.nodes.map((l) => l.name),
        dueDate: i.dueDate,
        updatedAt: i.updatedAt,
      })),
      summary: {
        total: issues.length,
        byStateType: issues.reduce((acc, i) => {
          const t = i.state?.type || "UNKNOWN";
          acc[t] = (acc[t] || 0) + 1;
          return acc;
        }, {}),
      },
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Markdown output
  const lines = [];

  lines.push(`# ${project.name} — Linear Roadmap`);
  lines.push("");
  lines.push(`> Pulled from [Linear](${project.url}) on ${new Date().toISOString().split("T")[0]}`);
  lines.push(`> Live source of truth: ${project.url}`);
  lines.push("");
  lines.push(`**State:** ${project.state} | **Target:** ${project.targetDate || "unset"} | **Issues:** ${issues.length}`);
  lines.push("");

  // Summary counts
  const stateCounts = {};
  for (const i of issues) {
    const n = i.state?.name || "unknown";
    stateCounts[n] = (stateCounts[n] || 0) + 1;
  }
  lines.push("## Status summary");
  lines.push("");
  for (const [state, count] of Object.entries(stateCounts).sort()) {
    lines.push(`- **${state}**: ${count}`);
  }
  lines.push("");

  // Milestones with progress
  lines.push("## Milestones");
  lines.push("");
  for (const m of milestones) {
    const msIssues = issues.filter((i) => i.projectMilestone?.id === m.id);
    const done = msIssues.filter((i) => i.state?.type === "completed").length;
    const total = msIssues.length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    lines.push(
      `### ${m.name}${m.targetDate ? ` — target ${m.targetDate}` : ""} (${done}/${total} done, ${pct}%)`,
    );
    if (m.description) {
      lines.push("");
      lines.push(m.description);
    }
    lines.push("");
  }

  // Issues grouped by milestone
  const filterMs = MILESTONE_FILTER
    ? milestones.find((m) =>
        m.name.toLowerCase().includes(MILESTONE_FILTER.toLowerCase()),
      )
    : null;

  if (filterMs) {
    lines.push(`## Issues in ${filterMs.name}`);
    lines.push("");
    const msIssues = issues
      .filter((i) => i.projectMilestone?.id === filterMs.id)
      .sort((a, b) => a.identifier.localeCompare(b.identifier));
    for (const issue of msIssues.filter((i) => !i.parent)) {
      lines.push(formatIssue(issue, issueMap, blockedBy, 0, issues));
    }
  } else {
    for (const m of milestones) {
      const msIssues = issues
        .filter((i) => i.projectMilestone?.id === m.id)
        .sort((a, b) => a.identifier.localeCompare(b.identifier));
      if (msIssues.length === 0) continue;
      lines.push(`## ${m.name}`);
      lines.push("");
      const roots = msIssues.filter((i) => !i.parent);
      for (const issue of roots) {
        lines.push(formatIssue(issue, issueMap, blockedBy, 0, issues));
      }
      lines.push("");
    }

    // Issues without a milestone
    const noMs = issues
      .filter((i) => !i.projectMilestone)
      .sort((a, b) => a.identifier.localeCompare(b.identifier));
    if (noMs.length > 0) {
      lines.push("## Unassigned milestone");
      lines.push("");
      const roots = noMs.filter((i) => !i.parent);
      for (const issue of roots) {
        lines.push(formatIssue(issue, issueMap, blockedBy, 0, issues));
      }
      lines.push("");
    }
  }

  // Labels reference
  lines.push("## Labels");
  lines.push("");
  for (const l of project.labels.nodes) {
    lines.push(`- \`${l.name}\` (${l.color})`);
  }
  lines.push("");

  console.log(lines.join("\n"));
}

function formatIssue(issue, issueMap, blockedBy, depth, allIssues) {
  const indent = "  ".repeat(depth);
  const stateBadge = issue.state?.name || "unknown";
  const priority =
    issue.priorityLabel && issue.priorityLabel !== "No priority"
      ? ` **[${issue.priorityLabel}]**`
      : "";
  const labels =
    issue.labels.nodes.length > 0
      ? ` *${issue.labels.nodes.map((l) => l.name).join(", ")}*`
      : "";
  const assignee = issue.assignee ? ` @${issue.assignee.name}` : "";
  const blockers = blockedBy.get(issue.id) || [];
  const blockedStr =
    blockers.length > 0
      ? ` blocked by ${blockers.map((b) => b.identifier).join(", ")}`
      : "";

  let line = `${indent}- [${issue.identifier}](${issue.url}) [${stateBadge}]${priority}${labels}${assignee}${blockedStr} — ${issue.title}`;

  if (allIssues && issue.children?.nodes?.length > 0) {
    const childLines = issue.children.nodes
      .map((child) => {
        const childIssue = issueMap.get(child.id);
        if (!childIssue) {
          return `${indent}  - [${child.identifier}] [${child.state?.name || "unknown"}] — ${child.title}`;
        }
        return formatIssue(childIssue, issueMap, blockedBy, depth + 1, allIssues);
      })
      .join("\n");
    return line + "\n" + childLines;
  }

  return line;
}

main().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
