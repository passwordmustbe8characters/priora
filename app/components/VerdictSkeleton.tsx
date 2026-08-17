/** Mirrors VerdictResults' landscape grid shape so the swap from skeleton
 * → real result doesn't jump around. */
export function VerdictSkeleton() {
  return (
    <div className="flex h-full min-h-0 animate-pulse flex-col">
      <div className="h-3 w-2/5 rounded-full bg-ink/10" />
      <div className="mt-3 h-6 w-4/5 rounded-lg bg-ink/10 sm:h-7" />

      <div className="mt-3 grid min-h-0 flex-1 auto-rows-min grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-ink/5" />
        ))}
      </div>
    </div>
  );
}
