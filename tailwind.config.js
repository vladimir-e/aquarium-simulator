/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/ui/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#1a1f2e',
        panel: '#242938',
        border: '#2d3548',
        accent: {
          green: '#22c55e',
          orange: '#f97316',
          blue: '#3b82f6',
        },
      },
    },
  },
  plugins: [],
};
