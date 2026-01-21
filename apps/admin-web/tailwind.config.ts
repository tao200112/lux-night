import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#2d3c4e",
        "primary-dark": "#1e2832",
        "primary-action": "#4a90e2",
        accent: "#c8ab5f",
        "background-light": "#ffffff",
        "background-dark": "#0f1419",
        surface: "#1a1f24",
        "surface-light": "#f5f5f5",
        "surface-dark": "#1a1f24",
        "border-light": "#e5e7eb",
        "border-dark": "#374151",
        "text-main": "#1f2937",
        "text-secondary": "#6b7280",
        success: "#10b981",
        warning: "#f59e0b",
        danger: "#ef4444",
        "status-success-bg": "#d1fae5",
        "status-success-bg-dark": "#065f46",
        "status-success-text": "#065f46",
        "status-success-text-dark": "#d1fae5",
        "status-pending-bg": "#fef3c7",
        "status-pending-text": "#92400e",
        "status-error-bg": "#fee2e2",
        "status-error-bg-dark": "#991b1b",
        "status-error-text": "#991b1b",
        "status-error-text-dark": "#fee2e2",
      },
      fontFamily: {
        display: ["Inter", "sans-serif"],
      },
    },
  },
  darkMode: "class",
  plugins: [],
};
export default config;
