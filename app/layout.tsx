import type { Metadata } from "next";
import { roundo, pilcrow } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Priora — Your execution is what matters",
  description:
    "Find out in seconds if your startup idea already exists — then get a real, sourced verdict before you build a thing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${roundo.variable} ${pilcrow.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">{children}</body>
    </html>
  );
}
