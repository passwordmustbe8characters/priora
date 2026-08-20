import { Resend } from "resend";

let client: Resend | null = null;

/** Lazily constructed, same pattern as getOpenAI()/getDb() — a missing
 * key surfaces as a clean error at send time, not a boot crash. */
function getResend(): Resend {
  if (!client) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not set");
    client = new Resend(apiKey);
  }
  return client;
}

/**
 * Phase 3 — Email Delivery. Attaches the PDF directly rather than
 * sending a download link — simpler, and avoids the stored blob URL
 * needing to be the actual access-control boundary for something
 * someone paid for (see assemble.ts's note on that).
 *
 * Deliberately does not mention monitoring/upsell anywhere in this
 * email — per spec, that's a separate, later touchpoint, not bundled
 * into report delivery.
 */
export async function sendReportEmail(params: { to: string; ideaOneLiner: string; pdf: Buffer }): Promise<void> {
  const resend = getResend();
  const from = process.env.REPORT_EMAIL_FROM;
  if (!from) throw new Error("REPORT_EMAIL_FROM is not set");

  const { error } = await resend.emails.send({
    from,
    to: params.to,
    subject: `Your Priora report is ready`,
    html: `
      <div style="font-family: Georgia, serif; color: #2b2620; max-width: 480px; margin: 0 auto; padding: 24px 0;">
        <p style="font-size: 15px; letter-spacing: 2px; text-transform: uppercase; color: #8a6c3f; margin: 0 0 16px;">Priora</p>
        <p style="font-size: 16px; line-height: 1.6;">Your competitive &amp; market report is attached.</p>
        <p style="font-size: 14px; line-height: 1.6; color: #6b6255;">${escapeForEmail(params.ideaOneLiner)}</p>
        <p style="font-size: 14px; line-height: 1.6; color: #6b6255; margin-top: 24px;">
          It separates sourced fact from Priora's own analysis throughout — worth reading the Sources &amp; Methodology
          page at the end if you want to trace any specific claim.
        </p>
      </div>
    `,
    attachments: [{ filename: "priora-report.pdf", content: params.pdf }],
  });

  if (error) throw new Error(`Failed to send report email: ${error.message}`);
}

function escapeForEmail(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
