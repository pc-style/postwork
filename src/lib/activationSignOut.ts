export type ActivationSignOutState =
  | "idle"
  | "waitingForRedemption"
  | "signingOut"
  | "error";
export type InviteActivationState =
  | "idle"
  | "checking"
  | "invalid"
  | "redeeming"
  | "error";

type SignOutGuard = { current: boolean };
type ActivationGuard = { current: boolean };
type RedemptionLock = { current: Promise<unknown> | null };

type InviteActivationOptions = {
  code: string;
  signOutGuard: SignOutGuard;
  signOutCancellationGuard: SignOutGuard;
  activationGuard: ActivationGuard;
  redemptionLock: RedemptionLock;
  checkInvite: (code: string) => Promise<boolean>;
  redeemInvite: (code: string) => Promise<unknown>;
  setState: (state: InviteActivationState) => void;
  onRedeemed: () => void;
};

export async function activateInvite({
  code,
  signOutGuard,
  signOutCancellationGuard,
  activationGuard,
  redemptionLock,
  checkInvite,
  redeemInvite,
  setState,
  onRedeemed,
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
    const redemption = Promise.resolve().then(() => redeemInvite(code));
    redemptionLock.current = redemption;
    try {
      await redemption;
    } finally {
      if (redemptionLock.current === redemption) redemptionLock.current = null;
    }
    const signOutQueued = signOutGuard.current || signOutCancellationGuard.current;
    onRedeemed();
    if (signOutQueued) {
      activationGuard.current = false;
      return;
    }
  } catch {
    activationGuard.current = false;
    if (!signOutCancellationGuard.current) {
      setState("error");
    }
  }
}

export async function signOutFromActivation(
  signOut: () => Promise<unknown>,
  guard: SignOutGuard,
  setState: (state: ActivationSignOutState) => void,
  activationCancellationGuard?: SignOutGuard,
  redemptionLock?: RedemptionLock,
) {
  if (guard.current) return;

  guard.current = true;
  const activeRedemption = redemptionLock?.current;
  if (activeRedemption) {
    setState("waitingForRedemption");
    try {
      await activeRedemption;
    } catch {
      // Redemption failure is reported by the activation coordinator.
    }
  } else if (activationCancellationGuard) {
    activationCancellationGuard.current = true;
  }
  setState("signingOut");

  try {
    await signOut();
  } catch {
    guard.current = false;
    setState("error");
  }
}
