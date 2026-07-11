export function insertContentUrl(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  url: string,
): { value: string; cursor: number } {
  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const leading = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const trailing = after.length > 0 && !after.startsWith("\n") ? "\n" : "";
  const insertion = `${leading}${url}${trailing}`;
  return {
    value: `${before}${insertion}${after}`,
    cursor: before.length + insertion.length,
  };
}
