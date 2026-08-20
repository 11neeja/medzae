import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Class names live here too — the notebook's mention chip is built in
    // lib/mentions.ts, and an unscanned file gets its styles purged.
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        heading: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      colors: {
        navy: {
          DEFAULT: 'var(--color-navy)',
          hover: 'var(--color-navy-hover)',
        },
        brand: {
          primary: 'var(--color-blue-primary)',
          secondary: 'var(--color-blue-secondary)',
          accent: 'var(--color-accent-soft)',
        },
        violet: {
          50: '#F2F7FF',
          100: '#E6F0FF',
          200: '#CCE0FF',
          300: '#BFD7FF',
          400: '#7BA3E8',
          500: '#1E429F',
          600: '#0B3B91',
          700: '#0B194D',
          800: '#000B33',
          900: '#000B33',
          950: '#000820',
        },
        purple: {
          50: '#F2F7FF',
          100: '#E6F0FF',
          200: '#CCE0FF',
          300: '#BFD7FF',
          400: '#7BA3E8',
          500: '#1E429F',
          600: '#0B3B91',
          700: '#0B194D',
          800: '#000B33',
          900: '#000B33',
          950: '#000820',
        },
        blue: {
          50: '#F2F7FF',
          100: '#E6F0FF',
          200: '#CCE0FF',
          300: '#BFD7FF',
          400: '#7BA3E8',
          500: '#0B3B91',
          600: '#0B3B91',
          700: '#1E429F',
          800: '#0B194D',
          900: '#000B33',
          950: '#000820',
        },
        slate: {
          50: '#F8F9FA',
          100: '#F2F7FF',
          200: '#E9ECEF',
          300: '#D9E7FF',
          400: '#94A3B8',
          500: '#6F7C86',
          600: '#4A5568',
          700: '#334155',
          800: '#1E293B',
          900: '#000B33',
          950: '#000820',
        },
        gray: {
          50: '#F8F9FA',
          100: '#F2F7FF',
          200: '#E9ECEF',
          300: '#D9E7FF',
          400: '#94A3B8',
          500: '#6F7C86',
          600: '#4A5568',
          700: '#334155',
          800: '#1E293B',
          900: '#000B33',
          950: '#000820',
        },
        primary: {
          DEFAULT: 'var(--color-blue-primary)',
          foreground: '#FFFFFF',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      },
      maxWidth: {
        content: '1280px',
      },
      boxShadow: {
        premium: 'var(--shadow-card)',
        'premium-md': 'var(--shadow-hover)',
        'premium-lg': 'var(--shadow-hover)',
        'premium-xl': 'var(--shadow-modal)',
        nav: 'var(--shadow-nav)',
        btn: 'var(--shadow-btn)',
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
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-in-down": {
          from: { opacity: "0", transform: "translateX(-50%) translateY(-12px)" },
          to: { opacity: "1", transform: "translateX(-50%) translateY(0)" },
        },
        "fade-slide-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out forwards",
        "fade-in-down": "fade-in-down 0.3s ease-out forwards",
        "fade-slide-up": "fade-slide-up 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;
