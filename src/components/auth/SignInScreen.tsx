import { useState, type ReactNode } from "react";
import { SignIn, SignUp } from "@clerk/clerk-react";
import { clerkAppearance } from "../../lib/providers";
import { AuthShell } from "./AuthShell";

/**
 * Step 1 of the auth flow: authenticate first, decide about workspaces later.
 * Clerk's own footer (sign-up link + branding) is hidden via the appearance
 * config, so the sign in / create account fork lives in our own toggle where
 * we control copy, casing, and tap targets.
 */
export function SignInScreen() {
  // Keep deep links working: signing in (or up) from a protected URL like
  // /app/settings must land back on that URL, not Clerk's default "/".
  const redirectTarget = `${window.location.pathname}${window.location.search}`;
  const [mode, setMode] = useState<"sign-in" | "create-account">("sign-in");

  return (
    <AuthShell
      title="welcome to postwork"
      description="sign in or create your account. connecting to a workspace is the next step, right after this one."
      footer={
        <p className="text-body text-muted">
          have an invite code? sign in first. you will enter the code on the
          next screen.
        </p>
      }
    >
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid grid-cols-2 gap-1 border-b border-border bg-bg p-1">
          <ModeButton
            active={mode === "sign-in"}
            onClick={() => setMode("sign-in")}
          >
            sign in
          </ModeButton>
          <ModeButton
            active={mode === "create-account"}
            onClick={() => setMode("create-account")}
          >
            create account
          </ModeButton>
        </div>
        {mode === "sign-in" ? (
          <SignIn
            appearance={clerkAppearance}
            forceRedirectUrl={redirectTarget}
            signUpForceRedirectUrl={redirectTarget}
          />
        ) : (
          <SignUp
            appearance={clerkAppearance}
            forceRedirectUrl={redirectTarget}
            signInForceRedirectUrl={redirectTarget}
          />
        )}
      </div>
    </AuthShell>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`ui-button min-h-11 rounded-md px-3 text-body transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft ${
        active
          ? "bg-surface-2 text-fg"
          : "bg-transparent text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
