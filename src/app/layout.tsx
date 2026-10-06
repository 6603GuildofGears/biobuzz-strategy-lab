import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { SITE_TITLE } from "@/components/sim/view-titles";
import { THEME_SCRIPT } from "@/lib/theme";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Google Analytics 4 measurement ID. */
const GA_ID = "G-FG5QSVKZK6";

export const metadata: Metadata = {
  // Each section page sets its own title, e.g. "Match viewer | BIOBUZZ Strategy Lab".
  title: { default: SITE_TITLE, template: `%s | ${SITE_TITLE}` },
  description: "Monte Carlo strategy simulator for the FTC 2026-27 BIOBUZZ game",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The <head> script adds the "dark" class before React loads, so React must accept <html> as it finds it.
      suppressHydrationWarning
    >
      <head>
        {/* Applies light or dark mode before the first paint, so there's no white flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        {/* Google tag (gtag.js) */}
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
        </Script>
      </body>
    </html>
  );
}
