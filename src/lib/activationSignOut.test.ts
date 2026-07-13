import { describe, expect, test } from "bun:test";
import { signOutFromActivation, type ActivationSignOutState } from "./activationSignOut";

describe("activation sign-out", () => {
  test("guards activation immediately and waits for sign-out", async () => {
    let finishSignOut: (() => void) | undefined;
    const signOut = () => new Promise<void>((resolve) => {
      finishSignOut = resolve;
    });
    const guard = { current: false };
    const states: ActivationSignOutState[] = [];

    const pending = signOutFromActivation(signOut, guard, (state) => states.push(state));

    expect(guard.current).toBe(true);
    expect(states).toEqual(["signingOut"]);

    finishSignOut?.();
    await pending;
    expect(guard.current).toBe(true);
  });

  test("ignores a second sign-out while the first is pending", async () => {
    let calls = 0;
    let finishSignOut: (() => void) | undefined;
    const signOut = () => {
      calls += 1;
      return new Promise<void>((resolve) => {
        finishSignOut = resolve;
      });
    };
    const guard = { current: false };

    const first = signOutFromActivation(signOut, guard, () => {});
    await signOutFromActivation(signOut, guard, () => {});

    expect(calls).toBe(1);
    finishSignOut?.();
    await first;
  });

  test("restores the activation surface with an error when sign-out fails", async () => {
    const guard = { current: false };
    const states: ActivationSignOutState[] = [];

    await signOutFromActivation(
      () => Promise.reject(new Error("network unavailable")),
      guard,
      (state) => states.push(state),
    );

    expect(guard.current).toBe(false);
    expect(states).toEqual(["signingOut", "error"]);
  });
});
