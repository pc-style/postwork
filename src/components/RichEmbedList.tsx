import { buildRichPreview, extractUrls } from "../lib/richEmbeds";

const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-presentation";
export const MAX_RICH_PREVIEWS_PER_BODY = 3;

export function RichEmbedList({ text }: { text: string }) {
  const previews = [...new Map(
    extractUrls(text)
      .map(buildRichPreview)
      .filter((preview) => preview !== null)
      .map((preview) => [preview.sourceUrl, preview]),
  ).values()].slice(0, MAX_RICH_PREVIEWS_PER_BODY);

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
              preload="metadata"
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

        return (
          <a
            key={preview.sourceUrl}
            href={preview.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group block min-w-0 rounded-md border border-border bg-bg px-3 py-2.5 transition-colors hover:border-accent/50 hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
          >
            <span className="block text-label text-accent-soft">{preview.hostname}</span>
            <span className="mt-0.5 block truncate text-sm text-muted group-hover:text-fg">{preview.label}</span>
          </a>
        );
      })}
    </div>
  );
}
