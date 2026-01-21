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
        // Primary brand colors (uimerchant design system)
        "primary": "#006666",
        "primary-hover": "#005555",
        // Admin design system colors (from uiadmin)
        "primary-dark": "#1f2a36", // Admin dark primary
        "accent": "#2563EB", // Admin accent blue
        // Background colors
        "background-light": "#ffffff",
        "background-dark": "#1a1d23",
        // Admin background colors
        "admin-bg-light": "#f3f4f6",
        "admin-bg-dark": "#111827",
        // Card colors
        "card-light": "#F5F7F9",
        "card-dark": "#252932",
        // Surface colors (for backward compatibility)
        "surface-dark": "#252932",
        "surface-light": "#F5F7F9",
        // Admin surface colors
        "admin-surface-light": "#ffffff",
        "admin-surface-dark": "#1f2937",
        // Status colors
        "alert-red": "#DC143C",
        "error": "#D32F2F",
        "warning": "#DC143C",
        "success": "#3CB371",
        "success-green": "#3CB371",
        "info": "#007AFF",
        "danger": "#DC143C",
        "status-amber": "#FFBF00",
        "status-success": "#10b981",
        "status-warning": "#f59e0b",
        "status-error": "#ef4444",
        // Admin status colors
        "admin-success": "#059669",
        "admin-warning": "#d97706",
        "admin-danger": "#dc2626",
        "admin-success-bg": "#E8F5E9",
        "admin-success-text": "#2E7D32",
        "admin-warning-bg": "#FFF3E0",
        "admin-warning-text": "#EF6C00",
        "admin-error-bg": "#FFEBEE",
        "admin-error-text": "#C62828",
        "admin-neutral-bg": "#F1F5F9",
        "admin-neutral-text": "#475569",
      },
      fontFamily: {
        "display": ["Lexend", "sans-serif"],
        "body": ["Lexend", "sans-serif"],
        "sans": ["Lexend", "sans-serif"],
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
