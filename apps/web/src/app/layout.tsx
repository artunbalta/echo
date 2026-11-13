import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Pixelify_Sans } from "next/font/google";
import "./globals.css";

// The wordmark's face, and the legend book's. Exposed as --font-pixel, which tailwind.config maps to
// the `font-pixel` utility.
const pixel = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pixel",
  display: "swap",
});

/**
 * The one face everything else is set in (DECISIONS C97). Until now the site named no face of its
 * own: "sans" and "serif" were whatever the visitor's machine had, so a title was New York on a Mac,
 * Cambria on Windows and Noto Serif on a phone, and no two people saw the same page. One variable
 * family, served by the build with the page (no request to anyone else), with the Turkish letters
 * (`latin-ext`); titles are its heavier weights, not a second family.
 */
const sans = Hanken_Grotesk({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base so the file-based icon/opengraph-image URLs resolve correctly in prod.
  metadataBase: new URL("https://echovirtualworld.com"),
  title: "ECHO. An agent that learns you from what you do.",
  description: "ECHO is a small village you walk through in your browser. It watches what you do there, not what you say, and builds an agent that acts like you. The village is opening in turns: join the waitlist.",
  openGraph: {
    title: "ECHO. An agent that learns you from what you do, then acts like you.",
    description: "A small village in your browser. It watches what you do, not what you say. Opening in turns: join the waitlist.",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  // icon.png / apple-icon.png / opengraph-image.jpg in src/app are auto-detected by Next. The share
  // picture is the landing's own hero (C89), so a link looks like the page it opens.
};

/**
 * The width and scale are Next's own defaults, written out because the third line is not.
 *
 * themeColor is what a phone actually shows around the world: without it Safari paints its bars in
 * default light chrome above an ink-purple page, and the seam is the first thing a visitor sees.
 *
 * viewportFit is deliberately NOT "cover". Cover would let the world reach the screen's corners,
 * which is the prettier answer, and it would also make every `env(safe-area-inset-*)` on this site
 * non-zero at once — including on overlays that do not read them, which is how a consent button
 * ends up under a home indicator. The controls that DO read them (TouchControls) carry their own
 * pixel fallbacks, so they are correct either way; turning cover on is a separate change with its
 * own sweep of every bottom-anchored element, and it is not what a phone needed to be playable.
 *
 * user-scalable and maximumScale are left alone on purpose: suppressing page zoom is an
 * accessibility regression, and the one element that must not pinch-zoom the page — the world's
 * canvas — already refuses it with `touch-action: none`, as do the touch controls.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1c1326",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `lang` is said again before the page's script runs by a page built in another language
    // (`app/tr/page.tsx`), and by `useLang` after it; React is told not to mind the difference.
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${pixel.variable}`}>
      <body>{children}</body>
    </html>
  );
}
