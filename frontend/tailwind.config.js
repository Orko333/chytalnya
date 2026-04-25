/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#e7e6ef",
          100: "#c7c5d8",
          200: "#a7a4c1",
          300: "#8782aa",
          400: "#676093",
          500: "#4c476f",
          600: "#393554",
          700: "#2a273f",
          800: "#1d1a2b",
          900: "#0f0e17",
        },
        parchment: {
          50: "#fffdf7",
          100: "#f8f3e6",
          200: "#ede4cf",
          300: "#dfd2b4",
          400: "#ccb88f",
          500: "#b49a6a",
        },
        amber: {
          50: "#fff3dc",
          100: "#ffe2b0",
          200: "#ffd084",
          300: "#ffbe57",
          400: "#ffb347",
          500: "#ff8906",
          600: "#e67800",
          700: "#b65d00",
        },
        crimson: {
          400: "#f25f4c",
          500: "#e53e3e",
          600: "#c53030",
        },
        surface: {
          DEFAULT: "#1c1b2e",
          100: "#252438",
          200: "#2c2b3e",
          300: "#35344a",
        },
        // Compatibility alias to avoid touching every existing component at once.
        brand: {
          50: "#fff3dc",
          100: "#ffe2b0",
          200: "#ffd084",
          300: "#ffbe57",
          400: "#ffb347",
          500: "#ff8906",
          600: "#e67800",
          700: "#b65d00",
          800: "#8a4700",
          900: "#5f3100",
        },
      },
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
        body: ["'Crimson Text'", "Georgia", "serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255, 137, 6, 0.22), 0 20px 50px rgba(0, 0, 0, 0.35)",
        "glow-sm": "0 0 12px rgba(255, 137, 6, 0.4)",
        "glow-lg": "0 0 0 1px rgba(255,137,6,0.3), 0 0 60px rgba(255,137,6,0.25), 0 30px 80px rgba(0,0,0,0.5)",
      },
      keyframes: {
        "shimmer-text": {
          "0%": { backgroundPosition: "0% center" },
          "100%": { backgroundPosition: "200% center" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "0.75" },
        },
        "border-spin": {
          from: { "--angle": "0deg" },
          to: { "--angle": "360deg" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        twinkle: {
          "0%, 100%": { opacity: "0.15", transform: "scale(0.7)" },
          "50%": { opacity: "0.9", transform: "scale(1.4)" },
        },
        "floating-orbs": {
          "0%, 100%": { transform: "translateY(0px) translateX(0px)", opacity: "0.3" },
          "50%": { transform: "translateY(-20px) translateX(10px)", opacity: "0.5" },
        },
      },
      animation: {
        "shimmer-text": "shimmer-text 7s linear infinite",
        float: "float 10s cubic-bezier(0.42, 0, 0.58, 1) infinite",
        "glow-pulse": "glow-pulse 5s cubic-bezier(0.42, 0, 0.58, 1) infinite",
        "fade-up": "fade-up 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards",
        twinkle: "twinkle 4s cubic-bezier(0.42, 0, 0.58, 1) infinite",
        "spin-slow": "spin 30s linear infinite",
        "floating-orbs": "floating-orbs 12s cubic-bezier(0.42, 0, 0.58, 1) infinite",
      },
    },
  },
  plugins: [],
};
