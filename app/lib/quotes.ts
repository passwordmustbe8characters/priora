export interface Quote {
  text: string;
  author: string;
}

/** Content for the bouncing circles to reveal on hover — all on the same
 * "ideas vs. execution" theme as Priora's own positioning. */
export const QUOTES: Quote[] = [
  { text: "It's easy to have ideas. It's very hard to turn an idea into a successful product.", author: "Jeff Bezos — Founder, Amazon" },
  { text: "Ideas are easy. Execution is everything. It takes a team to win.", author: "John Doerr — Venture capitalist / former Intel executive" },
  { text: "Ideas are worthless. Execution is everything.", author: "Scott Belsky — Founder of Behance" },
  { text: "Execution really shapes whether your company takes off or not.", author: "Pete Cashmore — Founder & former CEO, Mashable" },
  {
    text: "At the end of the day, for a business to succeed, the most important thing is not the idea, it is the execution. Because millions of people have ideas.",
    author: "Vineeta Singh — Co-founder & CEO, SUGAR Cosmetics",
  },
  { text: "Beyond that, execution is everything.", author: "Richard Davies — CEO, Allica Bank" },
  { text: "Ideas are cheap. Ideas are easy. Ideas are common. Everybody has ideas.", author: "Casey Neistat — Filmmaker & entrepreneur" },
  { text: "To me, ideas are worth nothing unless executed.", author: "Derek Sivers — Founder, CD Baby" },
  { text: "There's no shortage of remarkable ideas. What's missing is the will to execute them.", author: "Seth Godin — Entrepreneur & author" },
  { text: "Great execution is at least 10 times more important and 100 times more valuable than a great idea.", author: "Sam Altman — CEO, OpenAI" },
];
