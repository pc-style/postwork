import type { Doc } from "../../convex/_generated/dataModel";
import { Chip } from "./Chip";

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
    <Chip tone="accent" size="sm" className={className}>
      Admin
    </Chip>
  );
}
