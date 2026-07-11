import { isTrustedGifUrl } from "./richEmbeds";

export type GifResult = {
  id: string;
  title: string;
  previewUrl: string;
  originalUrl: string;
};

export interface GifSearchProvider {
  readonly name: string;
  readonly configured: boolean;
  search(query: string, signal?: AbortSignal): Promise<GifResult[]>;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function imageUrl(value: unknown): string | null {
  const image = record(value);
  const url = image?.url;
  return typeof url === "string" && isTrustedGifUrl(url) ? url : null;
}

function parseGiphyResponse(value: unknown): GifResult[] {
  const root = record(value);
  if (!Array.isArray(root?.data)) throw new Error("Giphy returned an unexpected response.");

  return root.data.flatMap((item): GifResult[] => {
    const gif = record(item);
    const images = record(gif?.images);
    const id = gif?.id;
    const title = gif?.title;
    const previewUrl = imageUrl(images?.fixed_width) ?? imageUrl(images?.downsized);
    const originalUrl = imageUrl(images?.original);
    if (typeof id !== "string" || !previewUrl || !originalUrl) return [];
    return [{
      id,
      title: typeof title === "string" && title.trim() ? title : "GIF",
      previewUrl,
      originalUrl,
    }];
  });
}

export function createGiphyProvider(apiKey: string | undefined, fetcher: Fetcher = fetch): GifSearchProvider {
  const key = apiKey?.trim() ?? "";
  return {
    name: "Giphy",
    configured: key.length > 0,
    async search(query, signal) {
      if (!key) throw new Error("GIF search isn't configured.");
      const trimmed = query.trim();
      if (!trimmed) return [];
      const url = new URL("https://api.giphy.com/v1/gifs/search");
      url.searchParams.set("api_key", key);
      url.searchParams.set("q", trimmed);
      url.searchParams.set("limit", "18");
      url.searchParams.set("rating", "pg-13");
      url.searchParams.set("lang", "en");

      const response = await fetcher(url, { signal });
      if (!response.ok) throw new Error("GIF search is unavailable right now.");
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new Error("GIF search is unavailable right now.");
      }
      return parseGiphyResponse(body);
    },
  };
}

export const gifProvider = createGiphyProvider(import.meta.env.VITE_GIPHY_API_KEY);
