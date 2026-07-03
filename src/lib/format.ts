import type { Priority } from "./types";

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.round(day / 7);
  return `${wk}w ago`;
}

export const SPACES = [
  "Engineering",
  "Product",
  "Design",
  "Company",
] as const;

export const PRIORITIES = ["urgent", "high", "normal"] as const;

export const priorityStyles: Record<
  Priority,
  { label: string; className: string; dot: string }
> = {
  urgent: {
    label: "Urgent",
    className: "bg-urgent/10 text-urgent border-urgent/30",
    dot: "bg-urgent",
  },
  high: {
    label: "High",
    className: "bg-high/10 text-high border-high/30",
    dot: "bg-high",
  },
  normal: {
    label: "Normal",
    className: "bg-faint/20 text-muted border-border",
    dot: "bg-muted",
  },
};

export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
