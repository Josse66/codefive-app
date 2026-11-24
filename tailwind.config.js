/** @type {import('tailwindcss').Config} */
export default {
  content: ['./server/views/**/*.hbs', './server/helpers/**/*.js', './client/**/*.js'],
  theme: {
    extend: {
      colors: {
        // Lámina de despiece del manual de servicio.
        placa: { DEFAULT: '#eef1f3', 2: '#e3e8ec', linea: '#c9d1d8' },
        tinta: { DEFAULT: '#141c24', 2: '#33404c', 3: '#55616c' },
        ref: { DEFAULT: '#b3121f', suave: '#f8e4e5' },
        hv: { DEFAULT: '#d9480f', texto: '#a63a0d', suave: '#fbe9df' },
        ok: { DEFAULT: '#2f7d43', suave: '#e3f1e6' },
        med: { DEFAULT: '#c98a00', texto: '#7d5400', suave: '#fbf0d6' },
        mal: { DEFAULT: '#b3121f', suave: '#f8e4e5' },
        nada: { DEFAULT: '#8a959f', suave: '#e8ecef' },
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        narrow: ['"Archivo Narrow"', 'Archivo', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '2px',
      },
    },
  },
  plugins: [],
};
