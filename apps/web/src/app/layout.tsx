import type { Metadata } from "next";
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
  title: "ECHO — AI agents that learn you",
  description: "A country that does not exist. It is your first day.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={pixel.variable}>
      <body>{children}</body>
    </html>
  );
}
