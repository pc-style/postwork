import { useEffect, useId, useRef, useState } from "react";
import { gifProvider, type GifResult, type GifSearchProvider } from "../lib/gifProvider";
import { usePopoverDismiss } from "../lib/usePopoverDismiss";
import { Button } from "./Button";

export function GifPicker({
  onSelect,
  provider = gifProvider,
}: {
  onSelect: (url: string) => void;
  provider?: GifSearchProvider;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const pickerId = useId();
  const titleId = useId();

  useEffect(() => () => controllerRef.current?.abort(), []);

  usePopoverDismiss(rootRef, () => {
    setOpen(false);
    // Restore focus to the trigger only when the dismissal would otherwise
    // drop focus to <body> (keyboard/screen-reader case). When the user
    // clicks a focusable element elsewhere, leave their focus alone.
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) triggerRef.current?.focus();
    });
  });

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const search = async () => {
    if (!query.trim() || loading || !provider.configured) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await provider.search(query, controller.signal);
      setResults(next);
      if (next.length === 0) setError("no GIFs found. try another phrase.");
    } catch (caught) {
      if (!controller.signal.aborted) {
        setError(caught instanceof Error ? caught.message : "GIF search is unavailable right now.");
      }
    } finally {
      if (controllerRef.current === controller) setLoading(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          close();
        }
      }}
    >
      <Button
        ref={triggerRef}
        variant="secondary"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? pickerId : undefined}
      >
        add GIF
      </Button>
      {open ? (
        <div
          id={pickerId}
          role="dialog"
          aria-labelledby={titleId}
          className="absolute bottom-full left-0 z-30 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-[0_16px_48px_rgba(0,0,0,0.35)]"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <p id={titleId} className="text-body font-medium text-fg">find a GIF</p>
            <Button variant="quiet" size="sm" onClick={() => close()}>close</Button>
          </div>
          {!provider.configured ? (
            <p role="status" className="rounded-md border border-border bg-bg px-3 py-2.5 text-body leading-relaxed text-muted">
              GIF search needs a Giphy key. set <code>VITE_GIPHY_API_KEY</code> locally to enable it.
            </p>
          ) : (
            <>
              <div role="search" className="flex gap-2">
                <label className="sr-only" htmlFor={searchId}>search GIFs</label>
                <input
                  id={searchId}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void search();
                    }
                  }}
                  autoFocus
                  placeholder="search GIFs"
                  className="ui-field min-w-0 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void search()}
                  disabled={!query.trim()}
                  loading={loading}
                  loadingLabel="searching…"
                >
                  search
                </Button>
              </div>
              {error ? <p role="status" className="mt-2 text-body text-muted">{error}</p> : null}
              {results.length > 0 ? (
                <div className="mt-3 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto" aria-label="GIF results">
                  {results.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      onClick={() => {
                        onSelect(gif.originalUrl);
                        close(false);
                      }}
                      className="aspect-square overflow-hidden rounded-sm border border-border bg-bg transition-colors hover:border-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
                      aria-label={`Add ${gif.title}`}
                    >
                      <img src={gif.previewUrl} alt="" loading="lazy" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-body text-muted">powered by Giphy</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
