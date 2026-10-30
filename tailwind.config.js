/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0b0d12',
        panel: '#11141b',
        elevated: '#171b24',
        line: '#252a35',
        muted: '#858b9a',
        accent: '#3b82f6'
      },
      fontFamily: {
        sans: ['Poppins', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace']
      },
      boxShadow: {
        glow: '0 0 32px rgba(59, 130, 246, 0.18)'
      }
    }
  },
  plugins: []
}
