export type SkeletonPreset =
  | "feed"
  | "post"
  | "stats"
  | "table"
  | "inline";

export function Skeleton({
  preset = "inline",
  count = 1,
  label = "Loading content",
}: {
  preset?: SkeletonPreset;
  count?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="w-full">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="grid gap-3">
        {Array.from({ length: count }, (_, index) => (
          <SkeletonShape key={index} preset={preset} />
        ))}
      </div>
    </div>
  );
}

function SkeletonShape({ preset }: { preset: SkeletonPreset }) {
  if (preset === "feed") {
    return (
      <div className="border-b border-border px-4 py-4">
        <div className="ui-skeleton h-4 w-3/4" />
        <div className="mt-3 flex gap-2">
          <div className="ui-skeleton h-3 w-20" />
          <div className="ui-skeleton h-3 w-28" />
        </div>
      </div>
    );
  }

  if (preset === "post") {
    return (
      <div className="py-4">
        <div className="ui-skeleton h-7 w-4/5" />
        <div className="ui-skeleton mt-3 h-3 w-2/5" />
        <div className="mt-8 space-y-3">
          <div className="ui-skeleton h-4 w-full" />
          <div className="ui-skeleton h-4 w-11/12" />
          <div className="ui-skeleton h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (preset === "stats") {
    return <div className="ui-skeleton h-20 rounded-lg" />;
  }

  if (preset === "table") {
    return (
      <div className="flex min-h-14 items-center gap-4 border-b border-border px-4">
        <div className="ui-skeleton h-4 w-1/4" />
        <div className="ui-skeleton h-4 w-1/3" />
        <div className="ui-skeleton ml-auto h-4 w-16" />
      </div>
    );
  }

  return <div className="ui-skeleton h-4 w-full" />;
}
