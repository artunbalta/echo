import type { Metadata, Viewport } from "next";
import { Pixelify_Sans } from "next/font/google";
import "./globals.css";

// Pixel display face used by the landing hero (matches the chunky pixel-art aesthetic).
// Exposed as --font-pixel, which tailwind.config maps to the `font-pixel` utility.
const pixel = Pixelify_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-pixel",
  display: "swap",
});

export const metadata: Metadata = {
  // Absolute base so the file-based icon/opengraph-image URLs resolve correctly in prod.
  metadataBase: new URL("https://echovirtualworld.com"),
  title: "echo.",
  description: "A country that does not exist. It is your first day.",
  openGraph: {
    title: "echo.",
    description: "A country that does not exist. It is your first day.",
    type: "website",
  },
  // icon.png / apple-icon.png / opengraph-image.png in src/app are auto-detected by Next.
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
    <html lang="en" className={pixel.variable}>
      <body>{children}</body>
    </html>
  );
}
