import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { gifProvider, type GifResult, type GifSearchProvider } from "../lib/gifProvider";
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
  const searchId = useId();

  useEffect(() => () => controllerRef.current?.abort(), []);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim() || loading || !provider.configured) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await provider.search(query, controller.signal);
      setResults(next);
      if (next.length === 0) setError("No GIFs found. Try another phrase.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "GIF search is unavailable right now.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        add GIF
      </Button>
      {open ? (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-3 shadow-[0_16px_48px_rgba(0,0,0,0.35)]">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-fg">Find a GIF</p>
            <Button variant="quiet" size="sm" onClick={() => setOpen(false)}>close</Button>
          </div>
          {!provider.configured ? (
            <p role="status" className="rounded-md border border-border bg-bg px-3 py-2.5 text-xs leading-relaxed text-muted">
              GIF search needs a Giphy key. Set <code>VITE_GIPHY_API_KEY</code> locally to enable it.
            </p>
          ) : (
            <>
              <form onSubmit={(event) => void search(event)} className="flex gap-2">
                <label className="sr-only" htmlFor={searchId}>Search GIFs</label>
                <input
                  id={searchId}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  autoFocus
                  placeholder="Search GIFs"
                  className="ui-field min-w-0 flex-1"
                />
                <Button type="submit" size="sm" disabled={!query.trim()} loading={loading} loadingLabel="searching…">
                  search
                </Button>
              </form>
              {error ? <p role="status" className="mt-2 text-xs text-muted">{error}</p> : null}
              {results.length > 0 ? (
                <div className="mt-3 grid max-h-64 grid-cols-3 gap-1.5 overflow-y-auto" aria-label="GIF results">
                  {results.map((gif) => (
                    <button
                      key={gif.id}
                      type="button"
                      onClick={() => {
                        onSelect(gif.originalUrl);
                        setOpen(false);
                      }}
                      className="aspect-square overflow-hidden rounded-sm border border-border bg-bg transition-colors hover:border-accent-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
                      aria-label={`Add ${gif.title}`}
                    >
                      <img src={gif.previewUrl} alt="" loading="lazy" className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-[11px] text-muted">Powered by Giphy</p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
