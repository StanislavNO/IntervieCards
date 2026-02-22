/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      colors: {
        brand: {
          50: '#eef5ff',
          400: '#4f8fff',
          500: '#2f7bff',
          600: '#1f65e8'
        },
        accent: {
          400: '#8a6dff',
          500: '#7056f6'
        }
      },
      boxShadow: {
        soft: '0 20px 50px -22px rgba(20, 20, 40, 0.4)'
      }
    }
  },
  plugins: []
};
