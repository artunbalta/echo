import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette sampled from the pixel-art style anchor (grass world).
        grass: "#74c365",
        grassdark: "#5aa64f",
        bark: "#7a4a2b",
        ink: "#1c1326",
        // The world's chrome (C68): one family. Ink to sit on, parchment to read, the echo's violet as
        // the one accent, ember for the people of the world, danger for what cannot be undone.
        "ink-deep": "#120c19",
        parchment: "#f4e9d0",
        echo: "#a06cd5",
        "echo-soft": "#c9b0ea",
        ember: "#e8c98a",
        danger: "#f0a48a",
      },
      fontFamily: {
        // One family (C97, `app/layout.tsx`). `font-serif` is still what a title is marked with, in
        // some thirty files; it now names the same family, and `globals.css` gives it its weight.
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        serif: ["var(--font-sans)", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        pixel: ["var(--font-pixel)", "ui-monospace", "monospace"],
      },
      keyframes: {
        // The empty roster slot's rim. Echo-violet is the landing's only accent and it is spent on
        // an EDGE, not a fill — so the edge is what breathes. Slow and shallow on purpose: this is
        // an absence waiting, not a notification demanding. Pair with `motion-reduce:animate-none`.
        breathe: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "0.95" },
        },
      },
      animation: {
        breathe: "breathe 4.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
