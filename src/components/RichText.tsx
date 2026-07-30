import type { ReactNode } from "react";
import { normalizeRichUrl, trimUrlPunctuation } from "../lib/richEmbeds";
import { CodeBlock } from "./CodeBlock";

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/giu;

function renderLinks(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const index = match.index;
    const raw = match[0];
    const candidate = trimUrlPunctuation(raw);
    const href = normalizeRichUrl(candidate);
    if (!href) continue;

    if (index > lastIndex) nodes.push(text.slice(lastIndex, index));
    nodes.push(
      <a
        key={`${keyPrefix}-${index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent-soft underline decoration-accent/40 underline-offset-2 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
      >
        {candidate}
      </a>,
    );
    if (candidate.length < raw.length) nodes.push(raw.slice(candidate.length));
    lastIndex = index + raw.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderInlineCode(text: string): ReactNode[] {
  return text.split(/(`[^`]+`)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code
          key={index}
          className="rounded-sm bg-surface-2 px-1 py-0.5 text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={index}>{renderLinks(part, `link-${index}`)}</span>;
  });
}

export function RichText({
  text,
  className = "prose-post text-fg",
}: {
  text: string;
  className?: string;
}) {
  const blocks: ReactNode[] = [];
  // Opening fence may carry a language; closing fence's preceding newline is
  // optional so blocks like ```js\ncode``` still match.
  const fence = /```([^\n`]*)\n([\s\S]*?)\n?```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before) {
      blocks.push(
        <div key={`text-${lastIndex}`} className={className}>
          {renderInlineCode(before)}
        </div>,
      );
    }

    blocks.push(
      <CodeBlock
        key={`code-${match.index}`}
        code={match[2] ?? ""}
        lang={(match[1] ?? "").trim()}
      />,
    );
    lastIndex = fence.lastIndex;
  }

  const after = text.slice(lastIndex);
  if (after || blocks.length === 0) {
    blocks.push(
      <div key={`text-${lastIndex}`} className={className}>
        {renderInlineCode(after)}
      </div>,
    );
  }

  return <div className="space-y-3">{blocks}</div>;
}
