export function insertContentUrl(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  url: string,
): { value: string; cursor: number } {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const leading = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  // Always leave a separate continuation line. Without it, a GIF inserted at
  // the end of a draft is extended by the next keystroke and stops matching
  // the trusted image URL.
  const trailing = !after.startsWith("\n") ? "\n" : "";
  const insertion = `${leading}${url}${trailing}`;
  return {
    value: `${before}${insertion}${after}`,
    cursor: before.length + insertion.length,
  };
}
