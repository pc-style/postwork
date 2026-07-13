export type ActivationSignOutState = "idle" | "signingOut" | "error";
export type InviteActivationState =
  | "idle"
  | "checking"
  | "invalid"
  | "redeeming"
  | "error";

type SignOutGuard = { current: boolean };
type ActivationGuard = { current: boolean };

type InviteActivationOptions = {
  code: string;
  signOutGuard: SignOutGuard;
  signOutCancellationGuard: SignOutGuard;
  activationGuard: ActivationGuard;
  checkInvite: (code: string) => Promise<boolean>;
  redeemInvite: (code: string) => Promise<unknown>;
  setState: (state: InviteActivationState) => void;
  onActivated: () => void;
};

export async function activateInvite({
  code,
  signOutGuard,
  signOutCancellationGuard,
  activationGuard,
  checkInvite,
  redeemInvite,
  setState,
  onActivated,
}: InviteActivationOptions) {
  if (!code || signOutGuard.current || activationGuard.current) return;

  activationGuard.current = true;
  signOutCancellationGuard.current = false;
  setState("checking");

  try {
    const valid = await checkInvite(code);
    if (signOutGuard.current || signOutCancellationGuard.current) {
      activationGuard.current = false;
      return;
    }
    if (!valid) {
      activationGuard.current = false;
      setState("invalid");
      return;
    }

    setState("redeeming");
    if (signOutGuard.current || signOutCancellationGuard.current) {
      activationGuard.current = false;
      return;
    }
    await redeemInvite(code);
    if (signOutGuard.current || signOutCancellationGuard.current) {
      activationGuard.current = false;
      return;
    }

    onActivated();
  } catch {
    activationGuard.current = false;
    if (!signOutGuard.current && !signOutCancellationGuard.current) {
      setState("error");
    }
  }
}

export async function signOutFromActivation(
  signOut: () => Promise<unknown>,
  guard: SignOutGuard,
  setState: (state: ActivationSignOutState) => void,
  activationCancellationGuard?: SignOutGuard,
) {
  if (guard.current) return;

  guard.current = true;
  if (activationCancellationGuard) activationCancellationGuard.current = true;
  setState("signingOut");

  try {
    await signOut();
  } catch {
    guard.current = false;
    setState("error");
  }
}
