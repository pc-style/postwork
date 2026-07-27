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
    const redemptionLock = { current: null };

    const activation = activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      redemptionLock,
      checkInvite: () => new Promise<boolean>((resolve) => {
        finishValidation = resolve;
      }),
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: () => {},
      onRedeemed: () => {
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
    const redemptionLock = { current: null };

    const activation = activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      redemptionLock,
      checkInvite: () => new Promise<boolean>((resolve) => {
        finishValidation = resolve;
      }),
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: () => {},
      onRedeemed: () => {},
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
      redemptionLock,
      checkInvite: async () => true,
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: () => {},
      onRedeemed: () => {},
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
      redemptionLock: { current: null },
      checkInvite: async () => true,
      redeemInvite: async () => {
        redeemCalls += 1;
      },
      setState: (state) => {
        if (state === "redeeming") signOutCancellationGuard.current = true;
      },
      onRedeemed: () => {},
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
    const redemptionLock = { current: null };
    const options = {
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      redemptionLock,
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
      onRedeemed: () => {},
    };

    const first = activateInvite(options);
    await activateInvite(options);

    expect(validationCalls).toBe(1);
    finishValidation?.(true);
    await first;
    expect(redeemCalls).toBe(1);
  });

  test("defers sign-out until in-flight redemption succeeds", async () => {
    let finishRedemption: (() => void) | undefined;
    let markRedemptionStarted: (() => void) | undefined;
    const redemptionStarted = new Promise<void>((resolve) => {
      markRedemptionStarted = resolve;
    });
    let activatedCalls = 0;
    let signOutCalls = 0;
    const signOutGuard = { current: false };
    const signOutCancellationGuard = { current: false };
    const activationGuard = { current: false };
    const redemptionLock = { current: null };
    const signOutStates: ActivationSignOutState[] = [];

    const activation = activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      redemptionLock,
      checkInvite: async () => true,
      redeemInvite: () => new Promise<void>((resolve) => {
        finishRedemption = resolve;
        markRedemptionStarted?.();
      }),
      setState: () => {},
      onRedeemed: () => {
        activatedCalls += 1;
      },
    });

    await redemptionStarted;
    const signOut = signOutFromActivation(
      async () => {
        signOutCalls += 1;
      },
      signOutGuard,
      (state) => signOutStates.push(state),
      signOutCancellationGuard,
      redemptionLock,
    );
    await Promise.resolve();

    expect(signOutCalls).toBe(0);
    expect(signOutStates).toEqual(["waitingForRedemption"]);

    finishRedemption?.();
    await Promise.all([activation, signOut]);

    expect(activatedCalls).toBe(1);
    expect(signOutCalls).toBe(1);
    expect(signOutStates).toEqual(["waitingForRedemption", "signingOut"]);
    expect(redemptionLock.current).toBeNull();
  });

  test("recovers when deferred redemption and sign-out both fail", async () => {
    let failRedemption: ((error: Error) => void) | undefined;
    let markRedemptionStarted: (() => void) | undefined;
    const redemptionStarted = new Promise<void>((resolve) => {
      markRedemptionStarted = resolve;
    });
    const signOutGuard = { current: false };
    const signOutCancellationGuard = { current: false };
    const activationGuard = { current: false };
    const redemptionLock = { current: null };
    const activationStates: InviteActivationState[] = [];
    const signOutStates: ActivationSignOutState[] = [];

    const activation = activateInvite({
      code: "pw-test",
      signOutGuard,
      signOutCancellationGuard,
      activationGuard,
      redemptionLock,
      checkInvite: async () => true,
      redeemInvite: () => new Promise<void>((_resolve, reject) => {
        failRedemption = reject;
        markRedemptionStarted?.();
      }),
      setState: (state) => activationStates.push(state),
      onRedeemed: () => {},
    });

    await redemptionStarted;
    const signOut = signOutFromActivation(
      () => Promise.reject(new Error("sign-out unavailable")),
      signOutGuard,
      (state) => signOutStates.push(state),
      signOutCancellationGuard,
      redemptionLock,
    );
    failRedemption?.(new Error("redemption unavailable"));
    await Promise.all([activation, signOut]);

    expect(activationStates.at(-1)).toBe("error");
    expect(signOutStates).toEqual([
      "waitingForRedemption",
      "signingOut",
      "error",
    ]);
    expect(activationGuard.current).toBe(false);
    expect(signOutGuard.current).toBe(false);
    expect(redemptionLock.current).toBeNull();
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
      redemptionLock: { current: null },
      checkInvite,
      redeemInvite: phase === "redemption"
        ? () => Promise.reject(new Error("redemption unavailable"))
        : async () => {},
      setState: (state) => states.push(state),
      onRedeemed: () => {},
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
