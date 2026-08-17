"use client";

import { useState } from "react";
import { Wordmark } from "./components/Wordmark";
import { ThemeToggle } from "./components/ThemeToggle";
import { Headline } from "./components/Headline";
import { SearchPanel } from "./components/SearchPanel";
import type { Phase } from "./lib/useVerdictFlow";

type Theme = "light" | "dark";

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [phase, setPhase] = useState<Phase>("idle");

  const revealed = phase !== "idle";
  const compact = phase === "loading" || phase === "result" || phase === "error";

  return (
    <div
      data-theme={theme}
      className="flex h-screen flex-col overflow-hidden bg-background text-foreground transition-colors duration-500"
    >
      <header className="flex w-full shrink-0 items-center justify-between px-6 pt-6 sm:px-10 sm:pt-8">
        <Wordmark />
        <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "light" ? "dark" : "light")} />
      </header>

      {/* Single centered column holding both headline and search — as the
          search panel grows into the results rectangle below, this whole
          group naturally re-centers, which is what reads as the headline
          "moving up small" to make room, with zero page scroll involved. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-8 sm:px-6">
        <Headline revealed={revealed} compact={compact} />
        <SearchPanel theme={theme} onPhaseChange={setPhase} />
      </div>
    </div>
  );
}
