import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Self-hosted Heebo from app/fonts.ts (Hebrew + Latin subsets)
        sans: ['var(--font-heebo-hebrew)', 'var(--font-heebo-latin)', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        income: {
          DEFAULT: 'hsl(var(--income))',
        },
        expense: {
          DEFAULT: 'hsl(var(--expense))',
        },
        cc: {
          DEFAULT: 'hsl(var(--cc))',
        },
      },
      // Motion tokens (app/globals.css and lib/motion.ts, ENG-67)
      transitionDuration: {
        quick: 'var(--motion-quick)',
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        page: 'var(--motion-page)',
      },
      transitionTimingFunction: {
        ui: 'var(--ease-ui)',
        spring: 'var(--ease-spring)',
      },
      // Elevation scale (app/globals.css, ENG-55)
      boxShadow: {
        e1: 'var(--elevation-1)',
        e2: 'var(--elevation-2)',
        e3: 'var(--elevation-3)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
      },
    },
  },
  plugins: [],
}
export default config
