import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-serif)', 'Newsreader', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#fdf6f0',
          100: '#fbece0',
          200: '#f6d6c0',
          300: '#eeb492',
          400: '#e4895c',
          500: '#c25e1a',
          600: '#b04712',
          700: '#92370e',
          800: '#772d10',
          900: '#612610',
          950: '#351205',
        },
        sand: {
          50: '#fdfcfb',
          100: '#fbf9f5',
          200: '#f5efea',
          300: '#efe8de',
          400: '#e3dcd2',
          500: '#d8cfbf',
          600: '#aba08e',
          700: '#827867',
          800: '#5c5447',
          900: '#3e382e',
        },
      },
      boxShadow: {
        'warm-sm': '0 1px 3px rgba(90, 60, 40, 0.04), 0 1px 2px rgba(90, 60, 40, 0.02)',
        'warm': '0 4px 16px -2px rgba(90, 60, 40, 0.05), 0 2px 6px -1px rgba(90, 60, 40, 0.03)',
        'warm-lg': '0 12px 32px -4px rgba(90, 60, 40, 0.08), 0 4px 12px -2px rgba(90, 60, 40, 0.04)',
      },
    },
  },
  plugins: [],
}
export default config
