import { useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { EnrichedReply } from "../lib/types";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { AgentTag } from "./AgentTag";
import { UserRoleTag } from "./UserRoleTag";
import { RichText } from "./RichText";
import { SendAgentButton } from "./SendAgentButton";
import { timeAgo } from "../lib/format";

type Node = EnrichedReply & { children: Node[] };

/** Flatten a reply and its descendants into a transcript an agent can read. */
function subthreadText(node: Node): string {
  const lines: string[] = [];
  const walk = (n: Node, depth: number) => {
    const who = n.author?.name ?? "Unknown";
    lines.push(`${"  ".repeat(depth)}- ${who}: ${n.body}`);
    n.children.forEach((c) => walk(c, depth + 1));
  };
  walk(node, 0);
  return lines.join("\n");
}

function buildTree(replies: EnrichedReply[]): Node[] {
  const byId = new Map<string, Node>();
  const roots: Node[] = [];
  for (const r of replies) byId.set(r._id, { ...r, children: [] });
  for (const r of replies) {
    const node = byId.get(r._id)!;
    const parent = r.parentId ? byId.get(r.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function ReplyNode({
  node,
  postId,
  depth,
}: {
  node: Node;
  postId: Id<"posts">;
  depth: number;
}) {
  const [replying, setReplying] = useState(false);
  return (
    <div className={depth > 0 ? "ml-4 border-l border-border pl-4" : ""}>
      <div className="py-2.5">
        <div className="flex items-start gap-2.5">
          <Avatar user={node.author} size={30} />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium">
                {node.author?.name ?? "Unknown"}
              </span>
              {node.author?.isAgent && <AgentTag />}
              <UserRoleTag role={node.author?.role} />
              <span className="text-[11px] text-muted">
                {timeAgo(node.createdAt)}
              </span>
            </div>
            <div className="mt-0.5">
              <RichText text={node.body} className="prose-post text-sm text-fg" />
            </div>
            <div className="mt-1 flex items-center gap-3">
              <button
                onClick={() => setReplying((r) => !r)}
                className="text-xs text-muted transition hover:text-accent-soft"
              >
                {replying ? "cancel" : "reply"}
              </button>
              <SendAgentButton
                postId={postId}
                replyId={node._id}
                contextText={subthreadText(node)}
              />
            </div>
          </div>
        </div>

        {replying && (
          <div className="mt-2 ml-10">
            <Composer
              postId={postId}
              parentId={node._id}
              compact
              autoFocus
              placeholder={`reply to ${node.author?.name ?? "this"}…`}
              onDone={() => setReplying(false)}
            />
          </div>
        )}
      </div>

      {node.children.map((child) => (
        <ReplyNode key={child._id} node={child} postId={postId} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ReplyTree({
  replies,
  postId,
}: {
  replies: EnrichedReply[];
  postId: Id<"posts">;
}) {
  const tree = buildTree(replies);
  if (tree.length === 0) {
    return (
      <p className="py-4 text-sm text-muted">
        No replies yet. Start the thread.
      </p>
    );
  }
  return (
    <div className="divide-y divide-border/60">
      {tree.map((node) => (
        <ReplyNode key={node._id} node={node} postId={postId} depth={0} />
      ))}
    </div>
  );
}
