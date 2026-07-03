import type { Org } from "../lib/spaces";

export function OrgSquare({ org, size = "size-6" }: { org: Org; size?: string }) {
  return (
    <div
      style={{ backgroundColor: org.color }}
      className={`flex ${size} shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-fg`}
      title={`${org.name} @${org.handle}`}
    >
      {org.initials}
    </div>
  );
}
