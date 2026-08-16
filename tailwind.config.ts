import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Ledger-inspired, professional palette (not generic AI-chat defaults).
        ink: {
          50: "#F5F6F8",
          100: "#E9EBEF",
          200: "#CDD2DC",
          300: "#A6AEBD",
          400: "#727C90",
          500: "#4E5871",
          600: "#374056",
          700: "#262E42",
          800: "#171D2C",
          900: "#0E1220",
          950: "#080A12",
        },
        ledger: {
          // muted brass/gold — the "sealed ledger" accent, used sparingly
          50: "#FBF6EA",
          100: "#F3E6C4",
          200: "#E6CD8E",
          300: "#D6B25E",
          400: "#C29A3E",
          500: "#B98B2A",
          600: "#976F1F",
          700: "#78591C",
          800: "#5C441A",
          900: "#3E2E13",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          muted: "#F7F8FA",
          subtle: "#EEF0F3",
        },
        positive: "#1B7A5C",
        negative: "#B4432E",
        pending: "#B98B2A",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "10px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(14 18 32 / 0.04), 0 1px 3px 0 rgb(14 18 32 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
