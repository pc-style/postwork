import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buildRichPreview, extractUrls } from "../lib/richEmbeds";

const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation";
export const MAX_RICH_PREVIEWS_PER_BODY = 3;

export function RichEmbedList({ text }: { text: string }) {
  const previews = useMemo(() => [...new Map(
    extractUrls(text)
      .map(buildRichPreview)
      .filter((preview) => preview !== null)
      .map((preview) => [preview.sourceUrl, preview]),
  ).values()].slice(0, MAX_RICH_PREVIEWS_PER_BODY), [text]);
  const genericUrls = useMemo(() => previews
    .filter((preview) => preview.kind === "link")
    .map((preview) => {
      const url = new URL(preview.sourceUrl);
      url.hash = "";
      return url.toString();
    }), [previews]);
  const storedPreviews = useQuery(api.linkPreviews.get, { urls: genericUrls });
  const requestPreviews = useMutation(api.linkPreviews.request);
  const requestedKey = useRef("");

  useEffect(() => {
    if (!storedPreviews) return;
    const storedUrls = new Set(storedPreviews.flatMap((preview) => preview ? [preview.url] : []));
    const missing = genericUrls.filter((url) => !storedUrls.has(url));
    const key = missing.join("\n");
    if (!key || requestedKey.current === key) return;
    requestedKey.current = key;
    // Unsafe/private URLs intentionally stay on the hostname/path fallback.
    void requestPreviews({ urls: missing }).catch(() => undefined);
  }, [genericUrls, requestPreviews, storedPreviews]);

  const previewByUrl = new Map(storedPreviews?.flatMap((preview) =>
    preview ? [[preview.url, preview] as const] : [],
  ));

  if (previews.length === 0) return null;

  return (
    <div className="mt-3 grid gap-2" aria-label="Linked media">
      {previews.map((preview) => {
        if (preview.kind === "embed") {
          const height = preview.aspect === "audio" ? "h-[152px]" : "aspect-video";
          return (
            <div key={preview.sourceUrl} className={`overflow-hidden rounded-md border border-border bg-bg ${height}`}>
              <iframe
                src={preview.embedUrl}
                title={preview.title}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                sandbox={IFRAME_SANDBOX}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
                allowFullScreen
                className="size-full border-0"
              />
            </div>
          );
        }

        if (preview.kind === "video") {
          return (
            <video
              key={preview.sourceUrl}
              controls
              playsInline
              // "none": direct video URLs point at arbitrary hosts, so no
              // request leaves the viewer's browser until they press play.
              preload="none"
              aria-label={preview.title}
              className="max-h-80 w-fit max-w-full rounded-md border border-border bg-black"
            >
              <source src={preview.sourceUrl} type={preview.contentType} />
              <a href={preview.sourceUrl}>open video</a>
            </video>
          );
        }

        if (preview.kind === "image") {
          return (
            <a
              key={preview.sourceUrl}
              href={preview.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-fit max-w-full overflow-hidden rounded-md border border-border bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
            >
              <img src={preview.sourceUrl} alt={preview.title} loading="lazy" className="max-h-80 max-w-full object-contain" />
            </a>
          );
        }

        const lookupUrl = new URL(preview.sourceUrl);
        lookupUrl.hash = "";
        const metadata = previewByUrl.get(lookupUrl.toString());
        const hasMetadata = metadata?.status === "ok" && Boolean(metadata.title || metadata.description);
        return (
          <a
            key={preview.sourceUrl}
            href={preview.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group block w-fit min-w-0 max-w-md overflow-hidden rounded-md border border-border border-l-2 border-l-accent bg-bg px-3 py-2.5 transition-colors hover:border-accent/50 hover:border-l-accent-soft hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
          >
            <span className="block font-mono text-body text-accent-soft">
              {hasMetadata && metadata.siteName ? metadata.siteName : preview.hostname}
            </span>
            <span className={`mt-0.5 block text-body group-hover:text-fg ${hasMetadata ? "font-medium text-fg" : "truncate text-muted"}`}>
              {hasMetadata ? metadata.title ?? preview.label : preview.label}
            </span>
            {hasMetadata && metadata.description ? (
              <span className="mt-1 line-clamp-3 block text-body leading-5 text-muted">{metadata.description}</span>
            ) : null}
            {hasMetadata && metadata.imageUrl ? (
              <img
                src={metadata.imageUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="mt-2 block max-h-64 w-full rounded-md border border-border object-cover"
              />
            ) : null}
          </a>
        );
      })}
    </div>
  );
}
