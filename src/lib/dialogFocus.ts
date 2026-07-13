import type { KeyboardEvent } from "react";

const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "details > summary:first-of-type",
  "[contenteditable='true']",
  "[tabindex]",
].join(",");

export function isEffectivelyTabbable(element: HTMLElement): boolean {
  if (element.matches(":disabled") || element.tabIndex < 0) return false;

  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      current.inert ||
      current.hasAttribute("inert") ||
      current.getAttribute("aria-hidden")?.trim().toLowerCase() === "true"
    ) {
      return false;
    }
  }

  return element.getClientRects().length > 0;
}

export function dialogFocusTarget(
  elements: readonly HTMLElement[],
  active: Element | null,
  shiftKey: boolean,
): HTMLElement | null | undefined {
  const first = elements[0];
  const last = elements.at(-1);
  if (!first || !last) return null;

  const activeIsTabbable = elements.some((element) => element === active);
  if (shiftKey && (active === first || !activeIsTabbable)) return last;
  if (!shiftKey && active === last) return first;
  return undefined;
}

export function trapDialogFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== "Tab") return;

  const elements = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR),
  ).filter(isEffectivelyTabbable);

  const target = dialogFocusTarget(
    elements,
    document.activeElement,
    event.shiftKey,
  );
  if (target === null) {
    event.preventDefault();
    return;
  }
  if (target) {
    event.preventDefault();
    target.focus();
  }
}
