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
    },
  },
  plugins: [],
}
