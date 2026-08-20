import type { CompetitorProfile, DeepReportContent } from "./types";
import { derivePricingBenchmarks, deriveSources } from "./types";

/**
 * Phase 3 — Report Document Assembly's HTML template. Adapted from the
 * validated template in priora-phase3-spec-for-claude-code.md (Section
 * 5), with one real, confirmed deviation: the spec's page-number footer
 * uses CSS `@page { @bottom-center { content: "...counter(page)..." } }`
 * — that's CSS Paged Media, which Chromium's print engine (what
 * Puppeteer drives) does not implement (confirmed via Puppeteer's own
 * GitHub issue #5613, not assumed). Puppeteer's actual mechanism is
 * `page.pdf({ footerTemplate })`, a separate HTML template evaluated
 * per page — see pdf.ts, which builds that footer to match this
 * template's visual language (Georgia, muted ink) rather than the CSS
 * rule that would silently do nothing.
 *
 * One further, deliberate simplification: the spec's footer is
 * suppressed on the cover page specifically (`@page :first`).
 * Reproducing that with Puppeteer's real footerTemplate mechanism would
 * need a two-pass render (cover alone, then the rest, then merged) —
 * real added complexity for a cosmetic nicety. The footer renders on
 * every page including the cover for now; flagged, not silently done.
 *
 * Every `escapeHtml` call below matters — this template interpolates
 * real founder/company text pulled from the open web, which must never
 * be trusted as safe HTML.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Bolds every mention of a referenced company name within a prose block
 * (executive summary, market landscape, synthesis sections) — makes the
 * companies being discussed easy to scan at a glance. Takes already-
 * escaped text and already-escaped names so the <strong> tags inserted
 * here are the only unescaped markup in the result. Matches longest name
 * first in a single combined pass (not one regex per name) so a name
 * that's a substring of another (e.g. "Invoice" inside "Invoice NG")
 * can't get partially matched and split a longer name's own bolding.
 */
function boldCompanyNames(escapedText: string, escapedNames: string[]): string {
  const names = [...new Set(escapedNames.filter(Boolean))].sort((a, b) => b.length - a.length);
  if (names.length === 0) return escapedText;
  const pattern = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return escapedText.replace(new RegExp(`\\b(${pattern})\\b`, "g"), "<strong>$1</strong>");
}

const TEMPLATE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: 'Georgia', serif; color: #2b2620; font-size: 10.3pt; line-height: 1.55; margin: 0; }

  .cover { min-height: 24cm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
  .cover .kicker { font-family: 'Helvetica', sans-serif; letter-spacing: 3px; text-transform: uppercase; font-size: 9.5pt; color: #8a6c3f; margin-bottom: 16px; }
  .cover h1 { font-size: 32pt; margin: 0 0 10px 0; color: #1c1712; font-weight: normal; line-height: 1.25; max-width: 13cm; }
  .cover .sub { font-family: 'Helvetica', sans-serif; font-size: 11.5pt; color: #6b6255; margin-top: 6px; }
  .cover .rule { width: 60px; height: 3px; background: #8a6c3f; margin-top: 24px; }
  .cover .meta { margin-top: 40px; font-family: 'Helvetica', sans-serif; font-size: 8.5pt; color: #9a9188; max-width: 11cm; }

  h2 { font-family: 'Helvetica', sans-serif; font-size: 14.5pt; color: #1c1712; border-bottom: 1.5px solid #d8cfc0; padding-bottom: 6px; margin-top: 26px; margin-bottom: 12px; }
  .section-tag { display: inline-block; font-family: 'Helvetica', sans-serif; font-size: 7.5pt; letter-spacing: 0.5px; text-transform: uppercase; padding: 2px 8px; border-radius: 3px; font-weight: bold; margin-bottom: 8px; }
  .tag-fact { background: #e5e9e0; color: #3d5c2f; }
  .tag-synthesis { background: #f4e3c8; color: #6b4a1f; }

  p { margin: 8px 0; }

  .profile-card { border: 1px solid #ddd3c0; border-radius: 6px; padding: 14px 16px; margin: 12px 0; background: #fdfcf9; }
  .profile-card.direct { border-left: 4px solid #8a6c3f; }
  .profile-card.adjacent { border-left: 4px solid #c9bfa8; }
  .profile-name { font-family: 'Helvetica', sans-serif; font-size: 12pt; font-weight: bold; color: #1c1712; display: inline-block; }
  .badge { font-family: 'Helvetica', sans-serif; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; font-weight: bold; vertical-align: middle; }
  .badge.direct { background: #e8d9c8; color: #6b4a1f; }
  .badge.adjacent { background: #efece4; color: #6b6255; }
  .profile-meta { font-family: 'Helvetica', sans-serif; font-size: 8.5pt; color: #6b6255; margin-top: 4px; }
  .profile-desc { margin-top: 8px; font-size: 9.5pt; }
  .profile-source { font-family: 'Helvetica', sans-serif; font-size: 8pt; color: #8a6c3f; margin-top: 6px; }

  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-family: 'Helvetica', sans-serif; font-size: 8.6pt; }
  th { background: #1c1712; color: #e8ddc8; text-align: left; padding: 7px 9px; }
  td { padding: 7px 9px; border-bottom: 1px solid #e5dcc9; }
  tr:nth-child(even) td { background: #faf7f0; }

  .synthesis-box { background: #f8f1e0; border: 1px solid #e5d3a8; padding: 12px 16px; margin: 10px 0; font-size: 9.6pt; }
  .synthesis-box .head { font-family: 'Helvetica', sans-serif; font-size: 8pt; font-weight: bold; color: #6b4a1f; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }

  .footer-note { font-family: 'Helvetica', sans-serif; font-size: 8pt; color: #9a9188; font-style: italic; margin-top: 20px; }
  .sources-list { font-family: 'Helvetica', sans-serif; font-size: 8.6pt; }
  .sources-list li { margin-bottom: 4px; }
`;

function competitorCard(c: CompetitorProfile, escapedNames: string[]): string {
  const metaParts = [c.pricing, c.fundingStage, c.targetUser].filter((v): v is string => Boolean(v)).map(escapeHtml);
  return `
    <div class="profile-card ${c.category}">
      <span class="profile-name">${escapeHtml(c.companyName)}</span><span class="badge ${c.category}">${c.category === "direct" ? "Direct" : "Adjacent"}</span>
      ${metaParts.length ? `<div class="profile-meta">${metaParts.join(" &middot; ")}</div>` : ""}
      <div class="profile-desc">${boldCompanyNames(escapeHtml(c.description), escapedNames)}</div>
      <div class="profile-source">Source: <a href="${escapeHtml(c.sourceUrl)}">${escapeHtml(c.sourceLabel)}</a></div>
    </div>`;
}

export function renderReportHtml(report: DeepReportContent, generatedDateDisplay: string): string {
  const directCompetitors = report.competitors.filter((c) => c.category === "direct");
  const adjacentCompetitors = report.competitors.filter((c) => c.category === "adjacent");
  const pricingRows = derivePricingBenchmarks(report.competitors);
  const sources = deriveSources(report);
  const escapedNames = report.competitors.map((c) => escapeHtml(c.companyName));
  const prose = (text: string) => boldCompanyNames(escapeHtml(text), escapedNames);

  const pricingTable = pricingRows.length
    ? `
    <table>
      <tr><th>Company</th><th>Entry price</th><th>Top tier</th><th>Model</th></tr>
      ${pricingRows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.companyName)}</td><td>${escapeHtml(r.entryPrice ?? "—")}</td><td>${escapeHtml(r.topPrice ?? "—")}</td><td>${escapeHtml(r.pricingModel ?? "—")}</td></tr>`,
        )
        .join("\n")}
    </table>`
    : `<p>Pricing detail wasn't confidently found for the companies in this report.</p>`;

  const synthesisSectionsHtml = report.synthesisSections
    .map(
      (s) => `
    <span class="section-tag tag-synthesis" style="margin-top: 18px;">Priora's analysis</span>
    <h2 style="margin-top: 8px;">${escapeHtml(s.heading)}</h2>
    <div class="synthesis-box">
      <div class="head">Strategic synthesis — reasoned from what was and wasn't found</div>
      ${prose(s.bodyText)}
    </div>`,
    )
    .join("\n");

  const sourcesListHtml = sources.length
    ? `<ul class="sources-list">${sources.map((s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.label)}</a></li>`).join("\n")}</ul>`
    : `<p>No external sources were used in this report.</p>`;

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${TEMPLATE_CSS}</style>
</head>
<body>

<div class="cover">
  <div class="kicker">Competitive &amp; Market Report</div>
  <h1>${escapeHtml(report.ideaOneLiner)}</h1>
  <div class="sub">Prepared by Priora &middot; Generated ${escapeHtml(generatedDateDisplay)}</div>
  <div class="rule"></div>
  <div class="meta">This report is grounded in live search results. Every factual claim links to its source — see Sources &amp; Methodology, final page.</div>
</div>

<span class="section-tag tag-fact">Sourced fact</span>
<h2>Executive Summary</h2>
<p>${prose(report.executiveSummary.text)}</p>

<h2>Market Landscape</h2>
<p>${prose(report.marketLandscape.fact.text)}</p>

<div class="synthesis-box">
  <div class="head">Priora's analysis — not sourced fact</div>
  ${prose(report.marketLandscape.synthesis.text)}
</div>

<h2>Direct Competitors</h2>
${directCompetitors.length ? directCompetitors.map((c) => competitorCard(c, escapedNames)).join("\n") : "<p>No direct competitors were confidently identified.</p>"}

<h2>Adjacent Players</h2>
${adjacentCompetitors.length ? adjacentCompetitors.map((c) => competitorCard(c, escapedNames)).join("\n") : "<p>No adjacent players were confidently identified.</p>"}

<h2>Pricing Benchmarks</h2>
${pricingTable}

${synthesisSectionsHtml}

<h2>Sources &amp; Methodology</h2>
${sourcesListHtml}
<p class="footer-note">Sourced-fact sections are traceable to a specific link. Synthesis sections are Priora's reasoned read of the pattern across sources and should be treated as a hypothesis, not verified data — always clearly labeled, never mixed together.</p>

</body>
</html>`;
}
