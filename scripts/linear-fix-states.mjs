#!/usr/bin/env bun

import { readFile } from "node:fs/promises";

const API = "https://api.linear.app/graphql";
const PROJECT_ID = "fdf9acb8-2808-48c4-b71e-3e11f1bee493";
const KEY = process.env.LINEAR_API_KEY;

if (!KEY) {
  console.error("LINEAR_API_KEY is required");
  process.exit(1);
}

const STATE = {
  backlog: "56a21667-a919-4831-bb09-e6157e93f83f",
  todo: "a0ca30c8-5fe8-47e9-8dc8-63fecbe78b86",
  inProgress: "938f3325-511c-4e89-967a-84e709b20a82",
  inReview: "8ed16fe8-3572-4d5f-a102-ea3d0c8fa94d",
  done: "49b370e0-c2df-448a-be9f-27bc6d2f05d3",
  canceled: "503079bc-8dbd-4e89-8a4a-aec8b3fd6507",
};

const STATE_MAP = {
  backlog: STATE.backlog,
  todo: STATE.todo,
  inProgress: STATE.inProgress,
  inReview: STATE.inReview,
  done: STATE.done,
  canceled: STATE.canceled,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gql(query, variables = {}) {
  const response = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await response.json();
  if (!response.ok || json.errors?.length) {
    const details = json.errors?.map((error) => error.message).join("; ");
    throw new Error(details || `Linear API returned HTTP ${response.status}`);
  }
  return json.data;
}

async function updateState(issueId, stateId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const data = await gql(
        `mutation($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success }
        }`,
        { id: issueId, input: { stateId } },
      );
      if (!data.issueUpdate.success) throw new Error("issueUpdate returned success=false");
      return;
    } catch (error) {
      const message = String(error?.message ?? error);
      if (attempt === 4 || !/rate|429/i.test(message)) throw error;
      await sleep(1000 * 2 ** attempt);
    }
  }
}

function flattenTree(nodes, output = []) {
  for (const node of nodes) {
    output.push({ title: node.title, status: node.status });
    if (node.children) flattenTree(node.children, output);
  }
  return output;
}

async function loadBuildTree() {
  const setupSource = await readFile(new URL("./linear-setup-postwork.mjs", import.meta.url), "utf8");
  const start = setupSource.indexOf("function buildTree(labels, milestones) {");
  const end = setupSource.indexOf("\nconst STATE_MAP =", start);
  if (start < 0 || end < 0) throw new Error("Could not extract buildTree from setup script");
  return Function(`"use strict"; ${setupSource.slice(start, end)}; return buildTree;`)();
}

async function main() {
  const buildTree = await loadBuildTree();
  const empty = new Proxy({}, { get: () => undefined });
  const expected = flattenTree(buildTree(empty, empty));
  const expectedByTitle = new Map(expected.map((item) => [item.title, item.status]));

  if (expectedByTitle.size !== expected.length) {
    throw new Error(`Issue tree contains ${expected.length - expectedByTitle.size} duplicate title(s)`);
  }

  const data = await gql(
    `query($id: String!) {
      project(id: $id) {
        issues(first: 250) {
          nodes { id identifier title state { id name } }
        }
      }
    }`,
    { id: PROJECT_ID },
  );
  if (!data.project) throw new Error(`Project ${PROJECT_ID} was not found`);

  const issues = data.project.issues.nodes;
  const unmatched = [];
  const errors = [];
  let matched = 0;
  let updated = 0;
  let alreadyCorrect = 0;

  for (const issue of issues) {
    const status = expectedByTitle.get(issue.title);
    if (!status) {
      unmatched.push(issue);
      continue;
    }
    matched += 1;
    const stateId = STATE_MAP[status];
    if (!stateId) {
      errors.push(`${issue.identifier}: unknown tree status ${status}`);
      continue;
    }
    if (issue.state.id === stateId) {
      alreadyCorrect += 1;
      continue;
    }
    try {
      await updateState(issue.id, stateId);
      updated += 1;
      console.log(`${issue.identifier}: ${issue.state.name} -> ${status}`);
    } catch (error) {
      errors.push(`${issue.identifier}: ${error?.message ?? error}`);
    }
    await sleep(120);
  }

  console.log("\nSummary");
  console.log(`Tree entries: ${expected.length}`);
  console.log(`Project issues: ${issues.length}`);
  console.log(`Matched: ${matched}`);
  console.log(`Updated: ${updated}`);
  console.log(`Already correct: ${alreadyCorrect}`);
  console.log(`Unmatched: ${unmatched.length}`);
  console.log(`Errors: ${errors.length}`);
  if (unmatched.length) console.log(`Unmatched issues: ${unmatched.map((issue) => `${issue.identifier} (${issue.title})`).join(", ")}`);
  if (errors.length) console.error(`Errors:\n${errors.join("\n")}`);
  if (errors.length) process.exitCode = 1;
}

await main();
