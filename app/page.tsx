"use client";

import { useState } from "react";
import { Wordmark } from "./components/Wordmark";
import { ThemeToggle } from "./components/ThemeToggle";
import { SearchBar } from "./components/SearchBar";
import { BouncingCircles } from "./components/BouncingCircles";
import { ResultsPanel } from "./components/ResultsPanel";
import { useVerdictFlow } from "./lib/useVerdictFlow";

type Theme = "light" | "dark";

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const flow = useVerdictFlow();

  return (
    <div
      data-theme={theme}
      className="relative h-screen overflow-hidden bg-background text-foreground transition-colors duration-500"
    >
      {/* The scattered circles + their morph-on-hover live behind
          everything else; the keepout zone they compute internally is
          what keeps the center clear for the search bar. */}
      <BouncingCircles />

      {/* Fixed above the sliding results panel (higher z-index) so the
          theme toggle stays reachable no matter what's open. */}
      <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8">
        <Wordmark />
        <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "light" ? "dark" : "light")} />
      </header>

      {/* pointer-events-none here — this wrapper spans the full viewport
          just to center its child, and without this it'd sit as an
          invisible full-screen layer over the circles (higher z-index),
          swallowing hover/click everywhere except literally on the input
          itself. SearchBar re-enables pointer-events on its own root. */}
      <div className="pointer-events-none relative z-10 flex h-full w-full items-center justify-center px-4">
        <SearchBar phase={flow.phase} onActivate={flow.activate} onCancel={flow.cancel} onSubmit={flow.submit} />
      </div>

      <ResultsPanel
        phase={flow.phase}
        result={flow.result}
        errorMessage={flow.errorMessage}
        lastIdea={flow.lastIdea}
        onSubmit={flow.submit}
        onReset={flow.reset}
      />
    </div>
  );
}
