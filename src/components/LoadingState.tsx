export function LoadingState({ label = "loading…" }: { label?: string }) {
  return (
    <div className="py-12 text-center text-sm lowercase text-muted">
      {label}
    </div>
  );
}
