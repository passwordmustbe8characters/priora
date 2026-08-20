import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Confirmed live in production: @sparticuz/chromium, puppeteer-core,
  // and puppeteer are all supposedly on Next.js's own built-in
  // auto-externalized package list (see the serverExternalPackages
  // docs), but that wasn't actually taking effect under this project's
  // Turbopack + Next 16.3.0 combination — the real error was Chromium's
  // own bin/ directory getting relocated by the bundler, breaking
  // chromium.executablePath() at runtime ("The input directory
  // '/var/task/node_modules/@sparticuz/chromium/bin' does not exist").
  // Listing them explicitly here fixes it regardless of why the
  // automatic list isn't kicking in.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core", "puppeteer"],

  // serverExternalPackages alone didn't fix it either — confirmed live,
  // the exact same "bin does not exist" error persisted after adding
  // that. Next.js's output file tracing (@vercel/nft) determines which
  // files actually get copied into the deployed function by statically
  // analyzing import/require/fs calls; @sparticuz/chromium resolves its
  // own binary path dynamically at runtime, which static analysis can't
  // follow, so the bin/ directory's contents never made it into the
  // deployment even with the package itself correctly externalized.
  // outputFileTracingIncludes force-includes them explicitly — this is
  // Next's own documented pattern for exactly this class of native-
  // binary dependency (their docs use aws-crt/dist/bin as the example).
  outputFileTracingIncludes: {
    "/*": ["node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
