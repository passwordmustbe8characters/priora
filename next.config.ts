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
};

export default nextConfig;
