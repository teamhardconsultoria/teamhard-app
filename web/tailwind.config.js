/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          yellow: '#E8FF00',
          dark: '#0A0A0A',
          card: '#111111',
          border: '#1E1E1E',
          muted: '#3A3A3A',
          text: '#FFFFFF',
          subtext: '#888888',
          success: '#00C853',
          error: '#FF4444',
          warning: '#FF9800',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
