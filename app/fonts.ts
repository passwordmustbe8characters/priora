import localFont from "next/font/local";

// Headline typeface — used for the wordmark and all display/heading text.
export const roundo = localFont({
  src: [
    { path: "../public/fonts/roundo/Roundo-ExtraLight.woff2", weight: "200", style: "normal" },
    { path: "../public/fonts/roundo/Roundo-Light.woff2", weight: "300", style: "normal" },
    { path: "../public/fonts/roundo/Roundo-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/roundo/Roundo-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/roundo/Roundo-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/roundo/Roundo-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-roundo",
  display: "swap",
});

// Body typeface — used for paragraphs, labels, inputs, UI chrome.
export const pilcrow = localFont({
  src: [
    { path: "../public/fonts/pilcrow/PilcrowRounded-Regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/pilcrow/PilcrowRounded-Medium.woff2", weight: "500", style: "normal" },
    { path: "../public/fonts/pilcrow/PilcrowRounded-Semibold.woff2", weight: "600", style: "normal" },
    { path: "../public/fonts/pilcrow/PilcrowRounded-Bold.woff2", weight: "700", style: "normal" },
    { path: "../public/fonts/pilcrow/PilcrowRounded-Heavy.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-pilcrow",
  display: "swap",
});
