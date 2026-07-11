export type TrustedEmbedProvider =
  | "youtube"
  | "vimeo"
  | "loom"
  | "figma"
  | "spotify";

export type TrustedEmbed = {
  kind: "embed";
  provider: TrustedEmbedProvider;
  sourceUrl: string;
  embedUrl: string;
  title: string;
  aspect: "video" | "document" | "audio";
};

export type RichPreview =
  | TrustedEmbed
  | {
      kind: "image";
      sourceUrl: string;
      title: string;
    }
  | {
      kind: "link";
      sourceUrl: string;
      hostname: string;
      label: string;
    };

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{6,12}$/;
const LOOM_ID = /^[A-Za-z0-9_-]{10,64}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{10,32}$/;
const FIGMA_KEY = /^[A-Za-z0-9]{8,128}$/;

function withoutCode(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ");
}

function trimUrlPunctuation(value: string): string {
  let result = value.replace(/[.,!?;:]+$/g, "");
  while (result.endsWith(")")) {
    const opens = (result.match(/\(/g) ?? []).length;
    const closes = (result.match(/\)/g) ?? []).length;
    if (closes <= opens) break;
    result = result.slice(0, -1);
  }
  return result;
}

export function extractUrls(text: string): string[] {
  const matches = withoutCode(text).match(URL_PATTERN) ?? [];
  const unique = new Set<string>();

  for (const match of matches) {
    const candidate = trimUrlPunctuation(match);
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      unique.add(parsed.toString());
    } catch {
      // A malformed URL stays plain body text.
    }
  }

  return [...unique];
}

function trustedUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function youtubeEmbed(url: URL): TrustedEmbed | null {
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    const pathMatch = url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)\/?$/);
    if (pathMatch?.[1]) id = pathMatch[1];
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    kind: "embed",
    provider: "youtube",
    sourceUrl: `https://www.youtube.com/watch?v=${id}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
    title: "YouTube video",
    aspect: "video",
  };
}

function vimeoEmbed(url: URL): TrustedEmbed | null {
  const host = url.hostname.toLowerCase();
  if (host !== "vimeo.com" && host !== "www.vimeo.com" && host !== "player.vimeo.com") return null;
  const match = url.pathname.match(/^(?:\/video)?\/(\d+)\/?$/);
  const id = match?.[1];
  if (!id || !VIMEO_ID.test(id)) return null;
  return {
    kind: "embed",
    provider: "vimeo",
    sourceUrl: `https://vimeo.com/${id}`,
    embedUrl: `https://player.vimeo.com/video/${id}`,
    title: "Vimeo video",
    aspect: "video",
  };
}

function loomEmbed(url: URL): TrustedEmbed | null {
  const host = url.hostname.toLowerCase();
  if (host !== "loom.com" && host !== "www.loom.com") return null;
  const match = url.pathname.match(/^\/(?:share|embed)\/([^/]+)\/?$/);
  const id = match?.[1];
  if (!id || !LOOM_ID.test(id)) return null;
  return {
    kind: "embed",
    provider: "loom",
    sourceUrl: `https://www.loom.com/share/${id}`,
    embedUrl: `https://www.loom.com/embed/${id}`,
    title: "Loom recording",
    aspect: "video",
  };
}

function spotifyEmbed(url: URL): TrustedEmbed | null {
  const host = url.hostname.toLowerCase();
  if (host !== "open.spotify.com") return null;
  const match = url.pathname.match(/^\/(track|album|playlist|episode|show)\/([^/]+)\/?$/);
  const type = match?.[1];
  const id = match?.[2];
  if (!type || !id || !SPOTIFY_ID.test(id)) return null;
  return {
    kind: "embed",
    provider: "spotify",
    sourceUrl: `https://open.spotify.com/${type}/${id}`,
    embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
    title: `Spotify ${type}`,
    aspect: "audio",
  };
}

function figmaEmbed(url: URL): TrustedEmbed | null {
  const host = url.hostname.toLowerCase();
  if (host !== "figma.com" && host !== "www.figma.com") return null;
  const match = url.pathname.match(/^\/(file|design|proto|board)\/([^/]+)(?:\/[^?#]*)?$/);
  const kind = match?.[1];
  const key = match?.[2];
  if (!kind || !key || !FIGMA_KEY.test(key)) return null;

  const source = new URL(`https://www.figma.com/${kind}/${key}`);
  const nodeId = url.searchParams.get("node-id");
  if (nodeId && /^[\w:-]{1,80}$/.test(nodeId)) source.searchParams.set("node-id", nodeId);
  const embed = new URL("https://www.figma.com/embed");
  embed.searchParams.set("embed_host", "postwork");
  embed.searchParams.set("url", source.toString());
  return {
    kind: "embed",
    provider: "figma",
    sourceUrl: source.toString(),
    embedUrl: embed.toString(),
    title: "Figma document",
    aspect: "document",
  };
}

export function matchTrustedEmbed(value: string): TrustedEmbed | null {
  const url = trustedUrl(value);
  if (!url) return null;
  return (
    youtubeEmbed(url) ??
    vimeoEmbed(url) ??
    loomEmbed(url) ??
    figmaEmbed(url) ??
    spotifyEmbed(url)
  );
}

export function isTrustedGifUrl(value: string): boolean {
  const url = trustedUrl(value);
  if (!url || url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return /^media\d*\.giphy\.com$/.test(host) || host === "i.giphy.com";
}

export function buildRichPreview(value: string): RichPreview | null {
  const embed = matchTrustedEmbed(value);
  if (embed) return embed;
  if (isTrustedGifUrl(value)) {
    return { kind: "image", sourceUrl: new URL(value).toString(), title: "GIF" };
  }
  const url = trustedUrl(value);
  if (!url) return null;
  return {
    kind: "link",
    sourceUrl: url.toString(),
    hostname: url.hostname.replace(/^www\./, ""),
    label: `${url.hostname.replace(/^www\./, "")}${url.pathname === "/" ? "" : url.pathname}`,
  };
}
