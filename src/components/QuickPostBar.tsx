import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useSession } from "../lib/session";
import { useStore } from "../lib/store";
import { PostForm } from "./PostForm";

function ChevronUpIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M6 15l6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// How long the bar stays popped after the pointer leaves it, so you don't have
// to aim precisely at the peek to keep it open. "3s, maybe a little less."
const HOVER_OUT_DELAY = 2500;

export function QuickPostBar() {
  const { currentUserId } = useSession();
  const store = useStore();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  // Forces the peek — even if hovered or focused — so Escape / the collapse
  // affordance can always tuck the composer mid-thought. Cleared by the next
  // hover-in or by focusing a field, restoring normal pop behavior.
  const [minimized, setMinimized] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, []);

  const clearLeaveTimer = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };

  const onPointerEnter = () => {
    clearLeaveTimer();
    setHovered(true);
    setMinimized(false);
  };

  const onPointerLeave = () => {
    clearLeaveTimer();
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false);
      leaveTimer.current = null;
    }, HOVER_OUT_DELAY);
  };

  // focusin/focusout via React's onFocus/onBlur. relatedTarget avoids a
  // focused=false flicker when focus moves between inputs inside the card.
  const onCardFocus: React.FocusEventHandler<HTMLDivElement> = () => {
    setFocused(true);
    setMinimized(false);
  };
  const onCardBlur: React.FocusEventHandler<HTMLDivElement> = (e) => {
    const next = e.relatedTarget as Node | null;
    if (next && cardRef.current?.contains(next)) return;
    setFocused(false);
  };

  // The bar is popped when hovered or focused — unless minimized, which wins.
  const popped = !minimized && (hovered || focused);

  const reset = () => {
    setOpen(false);
    setMinimized(false);
  };

  const reveal = () => {
    setMinimized(false);
    setOpen(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const collapse = () => {
    setMinimized(true);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleToggle = () => {
    if (minimized) return reveal();
    if (open) return collapse();
    return reveal();
  };

  // Escape tucks the bar immediately (draft preserved); ⌘/Ctrl + Enter posts.
  const onFieldKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      collapse();
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4">
      {/* At rest only the handle peeks; the bar pops when `popped` (hovered or
          focused, unless minimized). Hover-out is delayed by HOVER_OUT_DELAY so
          the bar stays reachable while you move the pointer toward it. */}
      <div
        ref={cardRef}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onFocus={onCardFocus}
        onBlur={onCardBlur}
        className={`pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-surface/95 shadow-2xl backdrop-blur will-change-transform transform-gpu transition-transform motion-reduce:transition-none ${
          popped
            ? "translate-y-0 duration-300 ease-spring"
            : "translate-y-[calc(100%_-_2.25rem)] duration-200 ease-out"
        }`}
      >
        {/* Peek handle — the only part visible at rest. Hover, click, or focus
            to reveal; click again while composing to tuck it away. */}
        <button
          type="button"
          onClick={handleToggle}
          aria-label={popped ? "tuck the composer away" : "start a post"}
          aria-expanded={popped}
          className="flex h-9 w-full items-center justify-center gap-2 text-xs text-muted transition hover:text-fg"
        >
          <span className="text-accent-soft">+</span>
          <span>start a post…</span>
          <ChevronUpIcon
            className={`size-3.5 text-faint transition-transform duration-200 ${
              popped ? "rotate-180 text-muted" : ""
            }`}
          />
        </button>

        <div className="px-3 pb-3 pt-1">
          <PostForm
            layout="quickBar"
            showSpace
            showTitle={open}
            showMeta={open}
            bodyRows={open ? 3 : 1}
            bodyResizeClassName="resize-none"
            autoFocusTitle={false}
            textareaRef={textareaRef}
            titlePlaceholder="title — what's this about?"
            bodyPlaceholder="share context, a decision, or a question…"
            resetOnSubmit
            onCancel={open ? reset : undefined}
            onSubmitted={open ? undefined : reveal}
            titleClassName="mb-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm font-medium outline-none focus:border-accent/50"
            textareaClassName="min-h-[2.5rem] w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent/50"
            metaClassName="mt-2 flex flex-wrap items-center gap-3"
            submitButtonClassName="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-fg transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-40"
            onFieldKeyDown={onFieldKeyDown}
            onSubmit={async ({ title, body, space, spaceId, priority }) => {
              if (!currentUserId || !space) return;
              const postId = await store.createPost({
                title,
                body,
                space,
                spaceId,
                priority,
              });
              reset();
              void navigate({ to: "/posts/$postId", params: { postId } });
            }}
          />
        </div>
      </div>
    </div>
  );
}
