import type { ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";

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
    return <span key={index}>{part}</span>;
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
