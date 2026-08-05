import type { Doc } from "../../convex/_generated/dataModel";

export const AGENT_HANDLES: Record<string, string> = {
  cursor: "Cursor",
  codex: "Codex",
  claude: "Claude Code",
};

export function parseAgentMentions(body: string): string[] {
  const handles = new Set<string>();
  const pattern = /(^|\W)@([a-z0-9_-]+)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const handle = match[2].toLowerCase();
    if (handle in AGENT_HANDLES) handles.add(handle);
  }
  return [...handles];
}

export function resolveAgentUser(handle: string, users: Doc<"users">[]): Doc<"users"> | undefined {
  const name = AGENT_HANDLES[handle.toLowerCase()];
  if (!name) return undefined;
  return users.find((user) => user.isAgent && user.name === name);
}
