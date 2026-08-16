/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#111827',
          blue: '#2563EB',
          green: '#059669',
        }
      }
    },
  },
  plugins: [],
}