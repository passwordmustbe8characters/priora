export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-display inline-flex items-center gap-2 text-xl font-bold tracking-tight ${className}`}
    >
      PR
      <span aria-hidden className="font-light opacity-60">
        |
      </span>
      ORA
    </span>
  );
}
