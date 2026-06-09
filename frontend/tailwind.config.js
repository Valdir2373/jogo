/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'var(--primary-color)',
          accent: 'var(--primary-accent)',
          border: 'var(--primary-border)',
          bg: 'var(--primary-bg)',
        }
      }
    },
  },
  plugins: [],
}
