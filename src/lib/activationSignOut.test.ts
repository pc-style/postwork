import { describe, expect, test } from "bun:test";
import {
  activateInvite,
  signOutFromActivation,
  type ActivationSignOutState,
  type InviteActivationState,
} from "./activationSignOut";

describe("invite activation", () => {
  test("does not redeem when sign-out begins while validation is pending", async () => {
    let finishValidation: ((valid: boolean) => void) | undefined;
    let finishSignOut: (() => void) | undefined;
    let redeemCalls = 0;
    let activatedCalls = 0;
    const signOutGuard = { current: false };
    const signOutCancellationGuard = { current: false };
    const activationGuard = { current: false };

    const activation = activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      checkInvite: () => new Promise<boolean>((resolve) => {
        finishValidation = resolve;
      }),
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: () => {},
      onActivated: () => {
        activatedCalls += 1;
      },
    });
    const signOut = signOutFromActivation(
      () => new Promise<void>((resolve) => {
        finishSignOut = resolve;
      }),
      signOutGuard,
      () => {},
      signOutCancellationGuard,
    );

    finishValidation?.(true);
    await activation;

    expect(redeemCalls).toBe(0);
    expect(activatedCalls).toBe(0);
    expect(activationGuard.current).toBe(false);

    finishSignOut?.();
    await signOut;
  });

  test("keeps the pending activation cancelled when sign-out fails", async () => {
    let finishValidation: ((valid: boolean) => void) | undefined;
    let redeemCalls = 0;
    const signOutGuard = { current: false };
    const signOutCancellationGuard = { current: false };
    const activationGuard = { current: false };

    const activation = activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      checkInvite: () => new Promise<boolean>((resolve) => {
        finishValidation = resolve;
      }),
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: () => {},
      onActivated: () => {},
    });

    await signOutFromActivation(
      () => Promise.reject(new Error("sign-out unavailable")),
      signOutGuard,
      () => {},
      signOutCancellationGuard,
    );
    expect(signOutGuard.current).toBe(false);
    expect(signOutCancellationGuard.current).toBe(true);

    finishValidation?.(true);
    await activation;

    expect(redeemCalls).toBe(0);
    expect(activationGuard.current).toBe(false);

    await activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      checkInvite: async () => true,
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: () => {},
      onActivated: () => {},
    });
    expect(redeemCalls).toBe(1);
  });

  test("rechecks sign-out immediately before redemption", async () => {
    let redeemCalls = 0;
    const signOutGuard = { current: false };
    const signOutCancellationGuard = { current: false };

    await activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard: { current: false },
      checkInvite: async () => true,
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: (state) => {
        if (state === "redeeming") signOutCancellationGuard.current = true;
      },
      onActivated: () => {},
    });

    expect(redeemCalls).toBe(0);
  });

  test("ignores a duplicate activation while validation is pending", async () => {
    let finishValidation: ((valid: boolean) => void) | undefined;
    let validationCalls = 0;
    let redeemCalls = 0;
    const signOutGuard = { current: false };
    const signOutCancellationGuard = { current: false };
    const activationGuard = { current: false };
    const options = {
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      checkInvite: () => {
        validationCalls += 1;
        return new Promise<boolean>((resolve) => {
          finishValidation = resolve;
        });
      },
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: (_state: InviteActivationState) => {},
      onActivated: () => {},
    };

    const first = activateInvite(options);
    await activateInvite(options);

    expect(validationCalls).toBe(1);
    finishValidation?.(true);
    await first;
    expect(redeemCalls).toBe(1);
  });

  test("does not finish activation when sign-out begins during redemption", async () => {
    let finishRedemption: (() => void) | undefined;
    let activatedCalls = 0;
    const signOutGuard = { current: false };
    const signOutCancellationGuard = { current: false };

    const activation = activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard: { current: false },
      checkInvite: async () => true,
      redeemInvite: () => new Promise<void>((resolve) => {
        finishRedemption = resolve;
      }),
      setState: () => {},
      onActivated: () => {
        activatedCalls += 1;
      },
    });

    await Promise.resolve();
    signOutCancellationGuard.current = true;
    finishRedemption?.();
    await activation;

    expect(activatedCalls).toBe(0);
  });

  test.each([
    ["validation", () => Promise.reject(new Error("validation unavailable"))],
    ["redemption", async () => true],
  ])("recovers after %s fails", async (phase, checkInvite) => {
    const states: InviteActivationState[] = [];
    const activationGuard = { current: false };

    await activateInvite({
      code: "pw-test",
      signOutGuard: { current: false },
      signOutCancellationGuard: { current: false },
      activationGuard,
      checkInvite,
      redeemInvite: phase === "redemption"
        ? () => Promise.reject(new Error("redemption unavailable"))
        : async () => {},
      setState: (state) => states.push(state),
      onActivated: () => {},
    });

    expect(activationGuard.current).toBe(false);
    expect(states.at(-1)).toBe("error");
  });
});

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
