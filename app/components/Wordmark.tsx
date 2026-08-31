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
 *
 * Two logo assets, swapped responsively — the full wordmark (mark +
 * "PRIORA" lettering) on `sm:` and up, and the standalone mark alone
 * below that, where the full wide wordmark doesn't have room to sit
 * comfortably next to the theme toggle. Both come in fixed-color
 * light/dark pairs (not a single currentColor asset), so which pair to
 * use is decided by `surfaceIsDark`, not just "is the theme dark" — see
 * that prop's own doc comment at the call site (page.tsx) for why.
 */
export function Wordmark({ className = "", surfaceIsDark }: { className?: string; surfaceIsDark: boolean }) {
  const suffix = surfaceIsDark ? "white" : "black";
  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages -- intentional hard navigation, see doc comment above
    <a
      href="/"
      aria-label="Priora — back to home"
      className={`inline-flex items-center transition-opacity hover:opacity-70 ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- small
          static SVG logos; next/image's optimization pipeline doesn't
          do anything useful for SVGs and adds real complexity for none */}
      <img src={`/logomark-${suffix}.svg`} alt="Priora" className="h-7 w-auto sm:hidden" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/logo-${suffix}.svg`} alt="Priora" className="hidden h-6 w-auto sm:block sm:h-7" />
    </a>
  );
}
