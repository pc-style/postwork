import type { Doc } from "../../convex/_generated/dataModel";

export function Avatar({
  user,
  size = 36,
  ring = false,
}: {
  user: Pick<Doc<"users">, "initials" | "avatarColor" | "name"> | null;
  size?: number;
  ring?: boolean;
}) {
  if (!user) {
    return (
      <div
        className="rounded-full bg-surface-2"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-fg ${
        ring ? "ring-2 ring-bg" : ""
      }`}
      style={{
        width: size,
        height: size,
        backgroundColor: user.avatarColor,
        fontSize: size * 0.38,
      }}
      title={user.name}
    >
      {user.initials}
    </div>
  );
}
