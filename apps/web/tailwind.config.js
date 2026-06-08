/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#E23D44',
        secondary: '#FF6B35',
        background: '#FFFFFF',
        surface: '#F8F8F8',
        textPrimary: '#1A1A1A',
        textSecondary: '#6B7280',
        border: '#E5E7EB',
        success: '#22C55E',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
