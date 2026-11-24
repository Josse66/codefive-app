/** @type {import('tailwindcss').Config} */
export default {
  content: ['./server/views/**/*.hbs', './client/**/*.js'],
  theme: {
    extend: {
      colors: {
        acero: { 50: '#eef3f8', 100: '#d9e4ef', 600: '#24527a', 700: '#1c4062', 900: '#17202a' },
        hv: { 500: '#d9480f', 100: '#fdebe1' },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'sans-serif'],
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
