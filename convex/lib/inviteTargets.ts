import type { Doc } from "../_generated/dataModel";
import type { AuthIdentity } from "../authUsers";

/**
 * Targeted ("hot") invite helpers, shared by the admin mint path and the
 * access redeem/claim path.
 *
 * A target is either a github handle or an email. Matching against a
 * signed-in user relies on the Clerk JWT claims Convex exposes:
 * `nickname` / `preferredUsername` carry the username (the github handle for
 * github sign-ups), `email` carries the primary email.
 */

export type InviteTarget = { kind: "github" | "email"; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Github usernames: alphanumeric + hyphens, max 39 chars.
const GITHUB_HANDLE_RE = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;

/**
 * Parse an admin-entered target string. Accepts an email address or a github
 * handle (with or without a leading `@`). Returns null for empty input;
 * throws on input that is neither.
 */
export function parseInviteTarget(raw: string | undefined): InviteTarget | null {
  const input = raw?.trim().toLowerCase() ?? "";
  if (!input) return null;
  if (input.includes("@") && !input.startsWith("@")) {
    if (!EMAIL_RE.test(input)) {
      throw new Error("That doesn't look like a valid email address.");
    }
    return { kind: "email", value: input };
  }
  const handle = input.replace(/^@/, "");
  if (!GITHUB_HANDLE_RE.test(handle)) {
    throw new Error("That doesn't look like a valid github handle or email.");
  }
  return { kind: "github", value: handle };
}

/** The identity keys a signed-in user can claim targeted invites with. */
export function identityTargetCandidates(identity: AuthIdentity): InviteTarget[] {
  const candidates: InviteTarget[] = [];
  for (const handle of [identity.nickname, identity.preferredUsername]) {
    const value = handle?.trim().toLowerCase();
    if (value && !candidates.some((c) => c.kind === "github" && c.value === value)) {
      candidates.push({ kind: "github", value });
    }
  }
  const email = identity.email?.trim().toLowerCase();
  if (email) candidates.push({ kind: "email", value: email });
  return candidates;
}

/** Does this identity satisfy the invite's target (or is it untargeted)? */
export function identityMatchesInvite(
  identity: AuthIdentity,
  invite: Pick<Doc<"invites">, "targetKind" | "targetValue">,
): boolean {
  if (!invite.targetKind || !invite.targetValue) return true;
  return identityTargetCandidates(identity).some(
    (c) => c.kind === invite.targetKind && c.value === invite.targetValue,
  );
}

/** Human-readable target for admin UI / audit metadata. */
export function formatInviteTarget(
  invite: Pick<Doc<"invites">, "targetKind" | "targetValue">,
): string | undefined {
  if (!invite.targetKind || !invite.targetValue) return undefined;
  return invite.targetKind === "github"
    ? `@${invite.targetValue}`
    : invite.targetValue;
}
