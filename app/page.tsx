"use client";

import { useEffect, useState } from "react";
import { Wordmark } from "./components/Wordmark";
import { ThemeToggle } from "./components/ThemeToggle";
import { SearchBar } from "./components/SearchBar";
import { BouncingCircles } from "./components/BouncingCircles";
import { ResultsPanel } from "./components/ResultsPanel";
import { IntroSequence } from "./components/IntroSequence";
import { useIsTouchDevice } from "./lib/useIsTouchDevice";
import { useVerdictFlow } from "./lib/useVerdictFlow";
import { captureReportBypassKey } from "./lib/reportBypass";

type Theme = "light" | "dark";

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [introDone, setIntroDone] = useState(false);

  // TEMP — see app/lib/reportBypass.ts. A plain side effect (storage
  // write, no setState), not the "derive during render" case — this
  // genuinely needs to run once against a browser-only API.
  useEffect(() => {
    captureReportBypassKey();
  }, []);
  // Only tracks the *manual* open/close (desktop's "Read more" /
  // "Close") — panelOpen below also folds in the mobile auto-open, as a
  // derived value rather than something synced into this state via an
  // effect (an effect just to mirror one condition into state is the
  // exact "you might not need an effect" case, and cascades an extra
  // render for no benefit over computing it directly).
  const [manuallyOpened, setManuallyOpened] = useState(false);
  const flow = useVerdictFlow();
  const isMobile = useIsTouchDevice();

  const searching = flow.phase === "loading" || flow.phase === "result" || flow.phase === "error";
  // The circles' keepout zone still grows regardless of device — harmless
  // even once the panel covers it. The search card's own in-place morph
  // is mobile-suppressed though: on a small screen there isn't room for
  // both a morphed card AND a full-screen panel, so mobile skips
  // straight to the panel (below) instead of showing the card first.
  const searchExpanded = !isMobile && searching;
  // Mobile: the search card never visually expands (searchExpanded is
  // always false there), so the panel has to be the one place results
  // actually show up — open the instant a search starts, not just after
  // a "Read more" tap (which, on mobile, never even renders).
  const panelOpen = manuallyOpened || (isMobile && searching);

  const handleReset = () => {
    flow.reset();
    setManuallyOpened(false);
  };

  // The fixed header sits above everything, including the results panel
  // (bg-foreground) once it's open — the text-color classes below have
  // no color of their own, they inherit, so without this text content
  // would render foreground-on-foreground and disappear the instant
  // the panel slides in. Match whichever surface is actually behind it.
  const headerOnInvertedSurface = searchExpanded || panelOpen;
  // Wordmark renders a real logo image now, not text — an image can't
  // inherit color the way text-foreground/text-background above does,
  // so it needs this decided explicitly. Not just "is the theme dark":
  // the header's actual background is the page's own background when
  // not inverted, but the PANEL's background (bg-foreground, i.e. the
  // theme's foreground color) once inverted — so inverted flips which
  // token is "behind" the header, which flips the answer relative to
  // theme alone. See Wordmark.tsx's own doc comment for the full truth
  // table this resolves.
  const surfaceIsDark = headerOnInvertedSurface ? theme === "light" : theme === "dark";

  return (
    <div
      data-theme={theme}
      className="relative h-screen overflow-hidden bg-background text-foreground transition-colors duration-500"
    >
      {!introDone && <IntroSequence onDone={() => setIntroDone(true)} />}

      {/* The scattered circles + their grow-on-hover live behind
          everything else; the keepout zone they compute internally is
          what keeps the center clear for the search card, and grows
          in step with it once a search is submitted. */}
      <BouncingCircles expanded={searching} />

      {/* Fixed above the sliding results panel (higher z-index) so the
          theme toggle stays reachable no matter what's open. */}
      <header
        className={`fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 pt-6 transition-colors duration-500 sm:px-10 sm:pt-8 ${
          headerOnInvertedSurface ? "text-background" : "text-foreground"
        }`}
      >
        <Wordmark surfaceIsDark={surfaceIsDark} />
        <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "light" ? "dark" : "light")} />
      </header>

      {/* pointer-events-none here — this wrapper spans the full viewport
          just to center its child, and without this it'd sit as an
          invisible full-screen layer over the circles (higher z-index),
          swallowing hover/click everywhere except literally on the input
          itself. SearchBar re-enables pointer-events on its own root. */}
      <div className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center px-4">
        <SearchBar
          phase={flow.phase}
          result={flow.result}
          loadingMore={flow.loadingMore}
          errorMessage={flow.errorMessage}
          lastIdea={flow.lastIdea}
          expanded={searchExpanded}
          onActivate={flow.activate}
          onCancel={flow.cancel}
          onSubmit={flow.submit}
          onReadMore={() => setManuallyOpened(true)}
          onReset={handleReset}
        />
      </div>

      <ResultsPanel
        open={panelOpen}
        phase={flow.phase}
        result={flow.result}
        loadingMore={flow.loadingMore}
        errorMessage={flow.errorMessage}
        // Mobile has no separate compact card to fall back to — closing
        // the panel there is closing the only results surface that
        // exists, so it resets the whole search rather than leaving a
        // orphaned "result" state with nothing showing it. Desktop just
        // hides the panel; the in-place card is still right there.
        onClose={isMobile ? handleReset : () => setManuallyOpened(false)}
        onRetry={() => flow.submit(flow.lastIdea)}
      />
    </div>
  );
}
