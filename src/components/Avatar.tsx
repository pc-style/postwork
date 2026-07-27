import { useState } from "react";
import type { Doc } from "../../convex/_generated/dataModel";

export function Avatar({
  user,
  size = 36,
  ring = false,
}: {
  user: Pick<
    Doc<"users">,
    "initials" | "avatarColor" | "name" | "avatarUrl"
  > | null;
  size?: number;
  ring?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!user) {
    return (
      <div
        className="rounded-full bg-surface-2"
        style={{ width: size, height: size }}
      />
    );
  }

  const avatarUrl = user.avatarUrl?.trim();
  if (avatarUrl && avatarUrl !== failedUrl) {
    return (
      <div
        className={`shrink-0 overflow-hidden rounded-full bg-surface-2 ${
          ring ? "ring-2 ring-bg" : ""
        }`}
        style={{ width: size, height: size }}
        title={user.name}
      >
        <img
          src={avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(avatarUrl)}
        />
      </div>
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
