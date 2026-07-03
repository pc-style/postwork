export type ReplyTreeNode<T extends { _id: string; parentId?: string | null }> =
  T & { children: ReplyTreeNode<T>[] };

export function buildReplyTree<
  T extends { _id: string; parentId?: string | null },
>(items: readonly T[]): ReplyTreeNode<T>[] {
  const byId = new Map<string, ReplyTreeNode<T>>();
  const roots: ReplyTreeNode<T>[] = [];

  for (const item of items) byId.set(item._id, { ...item, children: [] });
  for (const item of items) {
    const node = byId.get(item._id)!;
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}
