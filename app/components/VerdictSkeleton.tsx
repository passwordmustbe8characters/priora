/** Mirrors VerdictDisplay's shape so the swap from skeleton → real result
 * doesn't jump around — same card, same rough proportions, just pulsing
 * placeholder bars instead of content. */
export function VerdictSkeleton() {
  return (
    <div className="w-full max-w-2xl animate-pulse rounded-3xl bg-surface p-6 shadow-2xl sm:p-8">
      <div className="mb-6 h-9 w-9 rounded-full bg-ink/10" />

      <div className="h-3 w-3/5 rounded-full bg-ink/10" />

      <div className="mt-3 h-7 w-full rounded-lg bg-ink/10" />
      <div className="mt-2 h-7 w-4/5 rounded-lg bg-ink/10" />

      <div className="mt-6 flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-ink/5" />
        ))}
      </div>
    </div>
  );
}
