import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Primary brand colors (unified across all pages)
        "primary": "#c8ab5f",
        "primary-hover": "#b0851a",
        "secondary": "#AA8D55",
        // Background colors
        "background-light": "#faf8f4",
        "background-dark": "#121416",
        // Surface colors
        "surface-dark": "#1e1e1e",
        "surface-light": "#ffffff",
        "surface-highlight": "#1a1a1a",
        "lux-card": "#1E2224",
        "lux-black": "#121212",
        "lux-dark": "#121212",
        // Accent colors
        "lux-gold": "#E8B94B",
        "accent-gold": "#DFA925",
        // Status colors
        "alert-red": "#D45D5D",
        "lux-gray": "#A0A0A0",
      },
      fontFamily: {
        "display": ["Manrope", "sans-serif"],
        "body": ["Manrope", "sans-serif"],
        "serif": ["Noto Serif", "serif"],
        "sans": ["Manrope", "sans-serif"],
      },
      borderRadius: {
        "DEFAULT": "0.5rem",
        "lg": "1rem",
        "xl": "1.5rem",
        "2xl": "2rem",
        "full": "9999px"
      },
      backgroundImage: {
        'lux-gradient': 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.95) 100%)',
        'gold-shimmer': 'linear-gradient(45deg, rgba(255,255,255,0) 40%, rgba(205,160,55,0.2) 50%, rgba(255,255,255,0) 60%)'
      },
      boxShadow: {
        "glow": "0 0 20px -5px rgba(225, 191, 107, 0.3)",
        "glow-lg": "0 0 30px -8px rgba(225, 191, 107, 0.4)"
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};

export default config;
