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
 * Page numbering uses Puppeteer's real `footerTemplate` mechanism, not
 * the spec's CSS `@page { @bottom-center }` rule — see template.ts's
 * doc comment for why (confirmed unsupported by Chromium's print
 * engine, not assumed).
 */

const FOOTER_TEMPLATE = `
  <div style="width:100%; font-family: Georgia, serif; font-size: 8pt; color: #9a9188; text-align: center; padding: 4px 0 0;">
    Priora Report &middot; Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>
`;

export async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const isProduction = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

  let browser: import("puppeteer-core").Browser;

  if (isProduction) {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  } else {
    // Dynamic import so the full `puppeteer` devDependency (and its
    // bundled Chromium download) is never pulled into the production
    // bundle at all — only ever reached on this branch.
    const { default: puppeteerFull } = await import("puppeteer");
    browser = (await puppeteerFull.launch({ headless: true })) as unknown as import("puppeteer-core").Browser;
  }

  try {
    const page = await browser.newPage();
    // "load" is sufficient — the template is self-contained (system
    // fonts only, no external assets), nothing async to wait out.
    await page.setContent(html, { waitUntil: "load" });
    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "2.2cm", bottom: "2.2cm", left: "2cm", right: "2cm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: FOOTER_TEMPLATE,
    });
    return Buffer.from(pdfBytes);
  } finally {
    await browser.close();
  }
}
