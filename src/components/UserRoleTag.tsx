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
  if (role !== "admin" && role !== "tester") return null;

  return (
    <Chip tone="accent" size="sm" className={className}>
      {role === "admin" ? "Admin" : "Tester"}
    </Chip>
  );
}
