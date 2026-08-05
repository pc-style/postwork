import { createBundledHighlighter, createSingletonShorthands } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

const langs = {
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  bash: () => import("@shikijs/langs/bash"),
  python: () => import("@shikijs/langs/python"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  markdown: () => import("@shikijs/langs/markdown"),
};

const themes = {
  vesper: () => import("@shikijs/themes/vesper"),
};

type SupportedLang = keyof typeof langs;

const aliases: Record<string, SupportedLang | undefined> = {
  ts: "typescript",
  typescript: "typescript",
  tsx: "tsx",
  js: "javascript",
  javascript: "javascript",
  jsx: "jsx",
  json: "json",
  bash: "bash",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  python: "python",
  py: "python",
  go: "go",
  rust: "rust",
  rs: "rust",
  sql: "sql",
  html: "html",
  css: "css",
  diff: "diff",
  markdown: "markdown",
  md: "markdown",
};

const createHighlighter = createBundledHighlighter<keyof typeof langs, keyof typeof themes>({
  langs,
  themes,
  engine: () => createJavaScriptRegexEngine(),
});

const { codeToHtml } = createSingletonShorthands(createHighlighter);

function normalizeLang(lang: string): SupportedLang | undefined {
  return aliases[lang.trim().toLowerCase()];
}

export function isSupportedLang(lang: string): boolean {
  return normalizeLang(lang) !== undefined;
}

export async function highlight(code: string, lang: string): Promise<string | null> {
  const normalized = normalizeLang(lang);
  if (!normalized) return null;

  try {
    return await codeToHtml(code, { lang: normalized, theme: "vesper" });
  } catch {
    return null;
  }
}
