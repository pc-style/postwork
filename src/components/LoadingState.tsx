import { Skeleton, type SkeletonPreset } from "./Skeleton";

export function LoadingState({
  label = "Loading content",
  preset = "inline",
  count = 1,
}: {
  label?: string;
  preset?: SkeletonPreset;
  count?: number;
}) {
  return (
    <div className="py-4">
      <Skeleton label={label} preset={preset} count={count} />
    </div>
  );
}
