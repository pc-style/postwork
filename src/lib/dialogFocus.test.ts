import { describe, expect, test } from "bun:test";
import {
  dialogFocusTarget,
  isEffectivelyTabbable,
} from "./dialogFocus";

type ElementOptions = {
  disabled?: boolean;
  tabIndex?: number;
  visible?: boolean;
  ariaHidden?: string;
  inert?: boolean;
  parent?: HTMLElement | null;
};

function element({
  disabled = false,
  tabIndex = 0,
  visible = true,
  ariaHidden,
  inert = false,
  parent = null,
}: ElementOptions = {}): HTMLElement {
  return {
    inert,
    parentElement: parent,
    tabIndex,
    matches: (selector: string) => selector === ":disabled" && disabled,
    hasAttribute: (name: string) => name === "inert" && inert,
    getAttribute: (name: string) =>
      name === "aria-hidden" ? (ariaHidden ?? null) : null,
    getClientRects: () =>
      visible
        ? ([{}] as unknown as DOMRectList)
        : ([] as unknown as DOMRectList),
  } as HTMLElement;
}

describe("isEffectivelyTabbable", () => {
  test("rejects controls disabled by native fieldset semantics", () => {
    const fieldsetDisabledControl = element({ disabled: true });

    expect(isEffectivelyTabbable(fieldsetDisabledControl)).toBe(false);
  });

  test("rejects negative tab indexes and hidden or inert ancestor trees", () => {
    const ariaHiddenAncestor = element({ ariaHidden: " TRUE " });
    const inertAncestor = element({ inert: true });

    expect(isEffectivelyTabbable(element({ tabIndex: -1 }))).toBe(false);
    expect(isEffectivelyTabbable(element({ parent: ariaHiddenAncestor }))).toBe(false);
    expect(isEffectivelyTabbable(element({ parent: inertAncestor }))).toBe(false);
  });

  test("preserves rendered visibility as a requirement", () => {
    expect(isEffectivelyTabbable(element({ visible: false }))).toBe(false);
    expect(isEffectivelyTabbable(element())).toBe(true);
  });
});

describe("dialogFocusTarget", () => {
  test("wraps forward from the last candidate and backward from the first", () => {
    const first = element();
    const middle = element();
    const last = element();
    const candidates = [first, middle, last];

    expect(dialogFocusTarget(candidates, last, false)).toBe(first);
    expect(dialogFocusTarget(candidates, first, true)).toBe(last);
  });

  test("wraps backward from non-candidate focus and blocks an empty loop", () => {
    const first = element();
    const last = element();

    expect(dialogFocusTarget([first, last], element(), true)).toBe(last);
    expect(dialogFocusTarget([], null, false)).toBeNull();
  });
});
