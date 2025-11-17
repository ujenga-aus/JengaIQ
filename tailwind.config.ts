import type { Config } from "tailwindcss";
import plugin from "tailwindcss/plugin";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem", /* 9px */
        md: ".375rem", /* 6px */
        sm: ".1875rem", /* 3px */
      },
      colors: {
        // Flat / base colors (regular buttons)
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
          border: "hsl(var(--card-border) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
          border: "hsl(var(--popover-border) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          border: "var(--primary-border)",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
          border: "var(--secondary-border)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
          border: "var(--muted-border)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
          border: "var(--accent-border)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          border: "var(--destructive-border)",
        },
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          foreground: "hsl(var(--success-foreground) / <alpha-value>)",
          border: "var(--success-border)",
        },
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          foreground: "hsl(var(--warning-foreground) / <alpha-value>)",
        },
        ai: {
          DEFAULT: "hsl(var(--ai-primary) / <alpha-value>)",
          foreground: "hsl(var(--ai-primary-foreground) / <alpha-value>)",
          secondary: "hsl(var(--ai-secondary) / <alpha-value>)",
          accent: "hsl(var(--ai-accent) / <alpha-value>)",
        },
        ring: "hsl(var(--ring) / <alpha-value>)",
        chart: {
          "1": "hsl(var(--chart-1) / <alpha-value>)",
          "2": "hsl(var(--chart-2) / <alpha-value>)",
          "3": "hsl(var(--chart-3) / <alpha-value>)",
          "4": "hsl(var(--chart-4) / <alpha-value>)",
          "5": "hsl(var(--chart-5) / <alpha-value>)",
        },
        sidebar: {
          ring: "hsl(var(--sidebar-ring) / <alpha-value>)",
          DEFAULT: "hsl(var(--sidebar) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-foreground) / <alpha-value>)",
          border: "hsl(var(--sidebar-border) / <alpha-value>)",
        },
        "sidebar-primary": {
          DEFAULT: "hsl(var(--sidebar-primary) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-primary-foreground) / <alpha-value>)",
          border: "var(--sidebar-primary-border)",
        },
        "sidebar-accent": {
          DEFAULT: "hsl(var(--sidebar-accent) / <alpha-value>)",
          foreground: "hsl(var(--sidebar-accent-foreground) / <alpha-value>)",
          border: "var(--sidebar-accent-border)"
        },
        status: {
          online: "rgb(34 197 94)",
          away: "rgb(245 158 11)",
          busy: "rgb(239 68 68)",
          offline: "rgb(156 163 175)",
        },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        gradient: {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        gradient: "gradient 3s ease infinite",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"), 
    require("@tailwindcss/typography"),
    plugin(({ addComponents, addUtilities }) => {
      // Semantic typography classes powered by CSS variables in tokens.css
      addComponents({
        '.text-display': { fontSize: 'var(--fs-display)', lineHeight: 'var(--lh-tight)', fontWeight: '700', letterSpacing: 'var(--ls-tight)' },
        '.text-h1':      { fontSize: 'var(--fs-h1)',      lineHeight: 'var(--lh-tight)', fontWeight: '700', letterSpacing: 'var(--ls-tight)' },
        '.text-h2':      { fontSize: 'var(--fs-h2)',      lineHeight: 'var(--lh-snug)',  fontWeight: '600' },
        '.text-h3':      { fontSize: 'var(--fs-h3)',      lineHeight: 'var(--lh-snug)',  fontWeight: '600' },
        '.text-subtitle':{ fontSize: 'var(--fs-subtitle)',lineHeight: 'var(--lh-snug)',  fontWeight: '600' },
        '.text-body':    { fontSize: 'var(--fs-body)',    lineHeight: 'var(--lh-relaxed)', fontWeight: '500' },
        '.text-data':    { fontSize: 'var(--fs-data)',    lineHeight: 'var(--lh-data)',  fontWeight: '500' },
        '.text-data-xs': { fontSize: 'var(--fs-data-xs)', lineHeight: 'var(--lh-data)',  fontWeight: '500' },
        '.text-caption': { fontSize: 'var(--fs-caption)', lineHeight: 'var(--lh-caption)', color: 'hsl(var(--muted-foreground))' },
        '.text-mono':    { fontFamily: 'theme("fontFamily.mono")', fontSize: 'var(--fs-data)', lineHeight: 'var(--lh-data)' },
      });
      // Utilities that apply spacing variables
      addUtilities({
        '.grid-gap': { gap: 'var(--grid-gap)' },
        '.tile-gap': { padding: 'var(--tile-gap)' },
        '.row-h': { height: 'var(--row-height)' },
        '.cell-pad': { padding: 'var(--grid-cell-py) var(--grid-cell-px)' },
        '.menu-item-pad': { padding: 'var(--menu-item-py) var(--menu-item-px)' },
      });
    }),
  ],
} satisfies Config;
