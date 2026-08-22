import type { CompetitorProfile, DeepReportContent } from "./types";
import { derivePricingBenchmarks, deriveMarketStats, deriveSources } from "./types";

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
 * The cover page is rendered as its own separate document
 * (renderCoverHtml) from the rest (renderContentHtml) specifically so
 * pdf.ts can PDF each with different footer settings and merge them —
 * Puppeteer's footerTemplate mechanism applies uniformly to every page
 * of one page.pdf() call, no "skip the first page" option, so getting
 * the spec's "no footer on the cover" actually required two renders,
 * not a CSS trick. Page numbers in the footer therefore start at 1 on
 * the first content page (the cover itself stays unnumbered), which is
 * the standard convention for this kind of cover+numbered-body report.
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
  .badge.region { background: #e5e9e0; color: #445c3a; }
  .profile-meta { font-family: 'Helvetica', sans-serif; font-size: 8.5pt; color: #6b6255; margin-top: 4px; }
  .profile-desc { margin-top: 8px; font-size: 9.5pt; }
  .profile-source { font-family: 'Helvetica', sans-serif; font-size: 8pt; color: #8a6c3f; margin-top: 6px; }
  .profile-differentiator { font-style: italic; color: #6b4a1f; margin-top: 6px; font-size: 9.3pt; }

  .stats-row { display: flex; gap: 10px; margin: 10px 0; }
  .stat-tile { flex: 1; border: 1px solid #ddd3c0; border-radius: 6px; padding: 10px 14px; background: #fdfcf9; }
  .stat-tile .n { font-family: 'Helvetica', sans-serif; font-size: 17pt; font-weight: bold; color: #1c1712; }
  .stat-tile .l { font-family: 'Helvetica', sans-serif; font-size: 7.8pt; text-transform: uppercase; letter-spacing: 0.4px; color: #6b6255; margin-top: 2px; }

  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-family: 'Helvetica', sans-serif; font-size: 8.6pt; }
  th { background: #1c1712; color: #e8ddc8; text-align: left; padding: 7px 9px; }
  td { padding: 7px 9px; border-bottom: 1px solid #e5dcc9; }
  tr:nth-child(even) td { background: #faf7f0; }

  .synthesis-box { background: #f8f1e0; border: 1px solid #e5d3a8; padding: 12px 16px; margin: 10px 0; font-size: 9.6pt; }
  .synthesis-box .head { font-family: 'Helvetica', sans-serif; font-size: 8pt; font-weight: bold; color: #6b4a1f; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }

  .debate-row { display: flex; gap: 14px; margin: 10px 0; }
  .debate-box { flex: 1; border: 1px solid; border-radius: 6px; padding: 12px 16px; font-size: 9.6pt; }
  .debate-box .head { font-family: 'Helvetica', sans-serif; font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
  .debate-box.bull { background: #eef3e6; border-color: #c3d6ae; }
  .debate-box.bull .head { color: #3d5c2f; }
  .debate-box.bear { background: #f7e9e6; border-color: #e0bdb4; }
  .debate-box.bear .head { color: #8a3f2f; }

  .footer-note { font-family: 'Helvetica', sans-serif; font-size: 8pt; color: #9a9188; font-style: italic; margin-top: 20px; }
  .sources-list { font-family: 'Helvetica', sans-serif; font-size: 8.6pt; }
  .sources-list li { margin-bottom: 4px; }
`;

// Section 12, Fix 3 — the market-origin badge the spec asked for.
// Deliberately a lookup over the canonical `region` enum, never a
// heuristic over the free-text `headquarters` field — see that field's
// own doc comment in types.ts for why guessing from a string would be
// exactly the kind of ungrounded inference this report avoids
// elsewhere. Null renders no badge at all rather than an "Unknown" one.
function regionBadgeLabel(region: CompetitorProfile["region"]): string | null {
  if (region === "african") return "Africa-focused";
  if (region === "western") return "Western";
  if (region === "global") return "Global";
  return null;
}

function competitorCard(c: CompetitorProfile, escapedNames: string[]): string {
  // Phase 3, Section 10, Technique 1 — same fields as before plus the
  // wider extraction schema's new ones, folded into the same meta line
  // rather than a new visual element (they're the same kind of short,
  // labeled fact as pricing/fundingStage/targetUser already were).
  const metaParts = [
    c.pricing,
    c.fundingStage,
    c.namedInvestors,
    c.foundedYear && `Founded ${c.foundedYear}`,
    c.headquarters,
    c.targetUser,
  ]
    .filter((v): v is string => Boolean(v))
    .map(escapeHtml);
  const regionLabel = regionBadgeLabel(c.region);
  return `
    <div class="profile-card ${c.category}">
      <span class="profile-name">${escapeHtml(c.companyName)}</span><span class="badge ${c.category}">${c.category === "direct" ? "Direct" : "Adjacent"}</span>${regionLabel ? `<span class="badge region">${escapeHtml(regionLabel)}</span>` : ""}
      ${metaParts.length ? `<div class="profile-meta">${metaParts.join(" &middot; ")}</div>` : ""}
      <div class="profile-desc">${boldCompanyNames(escapeHtml(c.description), escapedNames)}</div>
      ${c.differentiator ? `<div class="profile-differentiator">&ldquo;${boldCompanyNames(escapeHtml(c.differentiator), escapedNames)}&rdquo;</div>` : ""}
      <div class="profile-source">Source: <a href="${escapeHtml(c.sourceUrl)}">${escapeHtml(c.sourceLabel)}</a></div>
    </div>`;
}

function documentShell(bodyHtml: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>${TEMPLATE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function renderCoverHtml(report: DeepReportContent, generatedDateDisplay: string): string {
  return documentShell(`
<div class="cover">
  <div class="kicker">Competitive &amp; Market Report</div>
  <h1>${escapeHtml(report.ideaOneLiner)}</h1>
  <div class="sub">Prepared by Priora &middot; Generated ${escapeHtml(generatedDateDisplay)}</div>
  <div class="rule"></div>
  <div class="meta">This report is grounded in live search results. Every factual claim links to its source — see Sources &amp; Methodology, final page.</div>
</div>`);
}

export function renderContentHtml(report: DeepReportContent): string {
  const directCompetitors = report.competitors.filter((c) => c.category === "direct");
  const adjacentCompetitors = report.competitors.filter((c) => c.category === "adjacent");
  const pricingRows = derivePricingBenchmarks(report.competitors);
  const sources = deriveSources(report);
  const stats = deriveMarketStats(report.competitors);
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

  // Phase 3, Section 10, Technique 3 — computed, not generated (see
  // deriveMarketStats's own doc comment on why the price comparison can
  // be null rather than forced). Tagged as sourced fact, same as the
  // pricing table below: it's arithmetic over already-verified fields,
  // not reasoned inference.
  const statsHtml = `
    <div class="stats-row">
      <div class="stat-tile"><div class="n">${stats.directCount}</div><div class="l">Direct competitors</div></div>
      <div class="stat-tile"><div class="n">${stats.adjacentCount}</div><div class="l">Adjacent players</div></div>
      <div class="stat-tile"><div class="n">${stats.totalCount}</div><div class="l">Total found</div></div>
    </div>
    ${
      stats.priceComparison
        ? `<p><strong>${escapeHtml(stats.priceComparison.cheapest.companyName)}</strong> is the lowest entry price found (${escapeHtml(stats.priceComparison.cheapest.entryPrice)}); <strong>${escapeHtml(stats.priceComparison.priciest.companyName)}</strong> the highest (${escapeHtml(stats.priceComparison.priciest.entryPrice)}), among competitors with comparable ${stats.priceComparison.currencySymbol === "$" ? "USD" : "NGN"} pricing.</p>`
        : ""
    }`;

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

  // Section 11 — omitted entirely (not rendered as an empty/placeholder
  // section) when debate is null: older reports generated before this
  // shipped, and any report where debate generation itself failed (see
  // orchestrate.ts's runDebateStage — a failure here never blocks the
  // rest of the report). Positioned after Priora's own synthesis
  // sections and before Sources & Methodology, per the spec's page
  // order — this is argument built on top of both the sourced facts
  // above and Priora's own read of them.
  const debateHtml = report.debate
    ? `
    <span class="section-tag tag-synthesis">Priora's analysis</span>
    <h2>The Case For / The Case Against</h2>
    <div class="debate-row">
      <div class="debate-box bull">
        <div class="head">The case for</div>
        ${prose(report.debate.bullCase.text)}
      </div>
      <div class="debate-box bear">
        <div class="head">The case against</div>
        ${prose(report.debate.bearCase.text)}
      </div>
    </div>`
    : "";

  const sourcesListHtml = sources.length
    ? `<ul class="sources-list">${sources.map((s) => `<li><a href="${escapeHtml(s.url)}">${escapeHtml(s.label)}</a></li>`).join("\n")}</ul>`
    : `<p>No external sources were used in this report.</p>`;

  return documentShell(`
<span class="section-tag tag-fact">Sourced fact</span>
<h2>Executive Summary</h2>
<p>${prose(report.executiveSummary.text)}</p>

<h2>Market Landscape</h2>
<p>${prose(report.marketLandscape.fact.text)}</p>

<div class="synthesis-box">
  <div class="head">Priora's analysis — not sourced fact</div>
  ${prose(report.marketLandscape.synthesis.text)}
</div>

<span class="section-tag tag-fact">Sourced fact</span>
<h2>Market at a Glance</h2>
${statsHtml}

<h2>Direct Competitors</h2>
${directCompetitors.length ? directCompetitors.map((c) => competitorCard(c, escapedNames)).join("\n") : "<p>No direct competitors were confidently identified.</p>"}

<h2>Adjacent Players</h2>
${adjacentCompetitors.length ? adjacentCompetitors.map((c) => competitorCard(c, escapedNames)).join("\n") : "<p>No adjacent players were confidently identified.</p>"}

<h2>Pricing Benchmarks</h2>
${pricingTable}

${synthesisSectionsHtml}

${debateHtml}

<h2>Sources &amp; Methodology</h2>
${sourcesListHtml}
<p class="footer-note">Sourced-fact sections are traceable to a specific link. Synthesis sections are Priora's reasoned read of the pattern across sources and should be treated as a hypothesis, not verified data — always clearly labeled, never mixed together.</p>`);
}
