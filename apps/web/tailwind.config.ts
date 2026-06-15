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
        parchment: "#f4e9d0",
        echo: "#a06cd5",
      },
      fontFamily: {
        pixel: ["var(--font-pixel)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
