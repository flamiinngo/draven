/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        surface:    "#111111",
        border:     "#1f1f1f",
        accent:     "#4f46e5",
        primary:    "#f5f5f5",
        secondary:  "#71717a",
        muted:      "#3f3f46",
        "tier-a-bg":   "#14532d",
        "tier-a-text": "#86efac",
        "tier-b-bg":   "#1e3a5f",
        "tier-b-text": "#93c5fd",
        "tier-c-bg":   "#3b1f1f",
        "tier-c-text": "#fca5a5",
        "skeleton":    "#1a1a1a",
      },
      fontFamily: {
        sans:  ["Inter", "system-ui", "sans-serif"],
        mono:  ["JetBrains Mono", "Menlo", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        sm: "4px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
      transitionDuration: {
        hover: "150ms",
        page:  "300ms",
      },
      keyframes: {
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-seq-1": { "0%, 66%, 100%": { opacity: "0.2" }, "33%": { opacity: "1" } },
        "pulse-seq-2": { "0%, 33%, 100%": { opacity: "0.2" }, "66%": { opacity: "1" } },
        "pulse-seq-3": { "0%, 33%, 66%":  { opacity: "0.2" }, "100%": { opacity: "1" } },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-8px)" },
        },
        "pulse-ring": {
          "0%":   { transform: "scale(0.9)", opacity: "1" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
      },
      animation: {
        shimmer:        "shimmer 2s linear infinite",
        "pulse-1":      "pulse-seq-1 1.5s ease-in-out infinite",
        "pulse-2":      "pulse-seq-2 1.5s ease-in-out infinite",
        "pulse-3":      "pulse-seq-3 1.5s ease-in-out infinite",
        float:          "float 4s ease-in-out infinite",
        "pulse-ring":   "pulse-ring 1.5s ease-out infinite",
      },
    },
  },
  plugins: [],
};
