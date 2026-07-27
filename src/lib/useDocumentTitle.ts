import { useEffect } from "react";

const DEFAULT_TITLE = "Postwork — async team communication";

// Module-level so the per-page title and the unread badge compose without
// fighting over document.title: pages own the base title, the shell owns
// the "(3) " prefix, and either update re-applies both.
let baseTitle = DEFAULT_TITLE;
let unreadBadge = 0;

function applyTitle() {
  document.title = unreadBadge > 0 ? `(${unreadBadge}) ${baseTitle}` : baseTitle;
}

export function useDocumentTitle(title: string) {
  useEffect(() => {
    baseTitle = title;
    applyTitle();
    return () => {
      baseTitle = DEFAULT_TITLE;
      applyTitle();
    };
  }, [title]);
}

/**
 * Keep the tab title prefixed with the unread count — `(3) postwork …` — so a
 * pinned tab works as a passive notification surface.
 */
export function useUnreadTabBadge(unread: number | undefined) {
  useEffect(() => {
    unreadBadge = unread ?? 0;
    applyTitle();
    return () => {
      unreadBadge = 0;
      applyTitle();
    };
  }, [unread]);
}
