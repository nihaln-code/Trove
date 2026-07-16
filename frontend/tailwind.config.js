/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        trove: {
          bg: '#0c0a08',
          surface: '#161210',
          card: '#1f1914',
          border: '#2e2419',
          accent: '#d08c3a',
          'accent-hover': '#b87830',
          text: '#ede6da',
          muted: '#8a7868',
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"DM Serif Display"', 'Georgia', 'serif'],
      },
      keyframes: {
        'reveal-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'tile-settle': {
          '0%': { opacity: '0', transform: 'translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.9)' },
          '100%': { opacity: '1', transform: 'translate(0, 0) rotate(var(--rot)) scale(1)' },
        },
      },
      animation: {
        'reveal-up': 'reveal-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both',
        'tile-settle': 'tile-settle 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
}
