"use client";

import { useState } from "react";
import { Wordmark } from "./components/Wordmark";
import { ThemeToggle } from "./components/ThemeToggle";
import { HeroPanel } from "./components/HeroPanel";
import { Headline } from "./components/Headline";

type Theme = "light" | "dark";

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [revealed, setRevealed] = useState(false);

  return (
    <div
      data-theme={theme}
      className="flex flex-col bg-background text-foreground transition-colors duration-500"
    >
      {/* Sticky at top:0, stays pinned as the panel below scrolls up over
          it — that's what makes the panel read as "covering" this section
          rather than just following it down the page. */}
      <section className="sticky top-0 flex h-screen flex-col items-center">
        <header className="flex w-full max-w-6xl items-center justify-between px-6 pt-8 sm:px-10">
          <Wordmark />
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "light" ? "dark" : "light")} />
        </header>

        <div className="flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 pb-16 text-center sm:px-6">
          <Headline revealed={revealed} />
        </div>
      </section>

      <HeroPanel theme={theme} onRevealedChange={setRevealed} />
    </div>
  );
}
