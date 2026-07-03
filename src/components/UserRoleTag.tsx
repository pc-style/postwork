import type { Doc } from "../../convex/_generated/dataModel";

type UserRole = Doc<"users">["role"];

export function UserRoleTag({
  role,
  className = "",
}: {
  role: UserRole;
  className?: string;
}) {
  if (role !== "admin") return null;

  return (
    <span
      className={`inline-flex items-center rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-soft ${className}`}
    >
      Admin
    </span>
  );
}
