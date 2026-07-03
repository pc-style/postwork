import { useEffect, useState } from "react";
import { highlight, isSupportedLang } from "../lib/shiki";

export function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const label = lang?.trim().toLowerCase() || "text";
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);

    if (!isSupportedLang(lang ?? "")) {
      setLoading(false);
      return;
    }

    setLoading(true);
    highlight(code, lang ?? "").then((nextHtml) => {
      if (cancelled) return;
      setHtml(nextHtml);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [code, lang]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-md border border-border bg-bg">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5 text-label text-muted">
        <span>{label}</span>
        <button onClick={copy} className="transition hover:text-fg">
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <div className="overflow-x-auto text-code leading-relaxed [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-3">
        {!loading && html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="m-0 p-3">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
