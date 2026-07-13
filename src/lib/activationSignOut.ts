export type ActivationSignOutState = "idle" | "signingOut" | "error";

type SignOutGuard = { current: boolean };

export async function signOutFromActivation(
  signOut: () => Promise<unknown>,
  guard: SignOutGuard,
  setState: (state: ActivationSignOutState) => void,
) {
  if (guard.current) return;

  guard.current = true;
  setState("signingOut");

  try {
    await signOut();
  } catch {
    guard.current = false;
    setState("error");
  }
}
