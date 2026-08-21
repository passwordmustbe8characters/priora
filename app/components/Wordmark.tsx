/**
 * Deliberately a plain <a>, not next/link — the home page is one big
 * client component whose whole flow (search, results panel, the intro
 * sequence, theme) lives in local React state, not the URL. A Link to
 * "/" while already on "/" is a same-route no-op in Next's router: no
 * navigation event fires, so nothing would actually reset. A real
 * anchor forces a full browser navigation/reload instead, which is
 * what actually gets back to a clean slate — matching how a logo click
 * is expected to behave ("start over") rather than doing nothing when
 * you're already home.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard navigation, see doc comment above
    <a
      href="/"
      aria-label="Priora — back to home"
      className={`font-display inline-flex items-center gap-2 text-xl font-bold tracking-tight transition-opacity hover:opacity-70 ${className}`}
    >
      PR
      <span aria-hidden className="font-light opacity-60">
        |
      </span>
      ORA
    </a>
  );
}
