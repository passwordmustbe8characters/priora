import { PDFDocument } from "pdf-lib";
import { renderContentHtml, renderCoverHtml } from "./template";
import type { DeepReportContent } from "./types";

/**
 * Phase 3 — HTML→PDF rendering. Two Chromium sources, branched by
 * environment:
 * - Production (Vercel): `puppeteer-core` + `@sparticuz/chromium` — a
 *   Linux binary purpose-built for serverless functions. Full
 *   `puppeteer` bundles its own Chromium download, which doesn't work
 *   in Vercel's function environment (size/cold-start constraints).
 * - Local dev: full `puppeteer` (devDependency only), which downloads
 *   a Chromium build for whatever OS is actually running — this is
 *   what makes it possible to test PDF generation locally on Windows
 *   at all, since @sparticuz/chromium has no Windows binary.
 *
 * Renders the cover and the rest of the report as two separate PDFs
 * (one Chromium session, two page.pdf() calls) and merges them with
 * pdf-lib — see template.ts's doc comment for why this two-pass
 * approach exists at all (Puppeteer's footerTemplate has no "skip the
 * first page" option, and that's the only way to get page numbers on
 * Chromium's print engine at all).
 */

const FOOTER_TEMPLATE = `
  <div style="width:100%; font-family: Georgia, serif; font-size: 8pt; color: #9a9188; text-align: center; padding: 4px 0 0;">
    Priora Report &middot; Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>
`;
const NO_FOOTER_TEMPLATE = "<div></div>";
const PDF_MARGIN = { top: "2.2cm", bottom: "2.2cm", left: "2cm", right: "2cm" };

async function launchBrowser(): Promise<import("puppeteer-core").Browser> {
  const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  if (isProduction) {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }

  // Dynamic import so the full `puppeteer` devDependency (and its
  // bundled Chromium download) is never pulled into the production
  // bundle at all — only ever reached on this branch.
  const { default: puppeteerFull } = await import("puppeteer");
  return puppeteerFull.launch({ headless: true }) as unknown as Promise<import("puppeteer-core").Browser>;
}

async function renderOnePdf(
  browser: import("puppeteer-core").Browser,
  html: string,
  footerTemplate: string,
): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    // "load" is sufficient — the template is self-contained (system
    // fonts only, no external assets), nothing async to wait out.
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      margin: PDF_MARGIN,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate,
    });
  } finally {
    await page.close();
  }
}

export async function renderReportPdf(report: DeepReportContent, generatedDateDisplay: string): Promise<Buffer> {
  const browser = await launchBrowser();
  try {
    const [coverBytes, contentBytes] = await Promise.all([
      renderOnePdf(browser, renderCoverHtml(report, generatedDateDisplay), NO_FOOTER_TEMPLATE),
      renderOnePdf(browser, renderContentHtml(report), FOOTER_TEMPLATE),
    ]);

    const merged = await PDFDocument.create();
    for (const bytes of [coverBytes, contentBytes]) {
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }

    return Buffer.from(await merged.save());
  } finally {
    await browser.close();
  }
}
