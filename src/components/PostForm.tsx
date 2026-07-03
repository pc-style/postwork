import { useState } from "react";
import type { ReactNode } from "react";
import { SPACES, PRIORITIES, priorityStyles } from "../lib/format";
import { Button } from "./Button";

type Priority = (typeof PRIORITIES)[number];

export type PostFormFields = {
  title: string;
  body: string;
  space?: string;
  priority: Priority;
};

export function PriorityPicker({
  priority,
  onChange,
}: {
  priority: Priority;
  onChange: (priority: Priority) => void;
}) {
  return (
    <div className="flex gap-1">
      {PRIORITIES.map((pr) => (
        <button
          key={pr}
          onClick={() => onChange(pr)}
          className={`rounded-md border px-2.5 py-1 text-xs lowercase transition ${
            priority === pr
              ? priorityStyles[pr].className
              : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-fg"
          }`}
        >
          {pr}
        </button>
      ))}
    </div>
  );
}

export function PostForm({
  showSpace = false,
  requireTitle = true,
  titlePlaceholder = "what's this about? write a clear title.",
  bodyPlaceholder = "share the full context. posts are durable, write it so someone finds it in search next quarter.",
  submitLabel = "post",
  extraFields,
  onCancel,
  onSubmit,
}: {
  showSpace?: boolean;
  requireTitle?: boolean;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  submitLabel?: string;
  extraFields?: ReactNode;
  onCancel: () => void;
  onSubmit: (fields: PostFormFields) => Promise<void> | void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [space, setSpace] = useState<string>(SPACES[0]);
  const [priority, setPriority] = useState<Priority>("normal");
  const [busy, setBusy] = useState(false);

  const canSubmit = (!requireTitle || title.trim().length > 0) && body.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        space: showSpace ? space : undefined,
        priority,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        placeholder={titlePlaceholder}
        className="mb-3 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-base font-medium outline-none focus:border-accent/50"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={7}
        placeholder={bodyPlaceholder}
        className="mb-3 w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm outline-none focus:border-accent/50"
      />

      <div className="mb-4 flex flex-wrap items-center gap-4">
        {showSpace && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted)]">space</span>
            <select
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-sm outline-none focus:border-accent/50"
            >
              {SPACES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-muted)]">priority</span>
          <PriorityPicker priority={priority} onChange={setPriority} />
        </div>

        {extraFields}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="quiet" onClick={onCancel}>
          cancel
        </Button>
        <Button onClick={() => void submit()} disabled={busy || !canSubmit}>
          {busy ? "posting…" : submitLabel}
        </Button>
      </div>
    </div>
  );
}
