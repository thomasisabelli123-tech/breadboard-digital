/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: { 0: '#0b0f14', 1: '#111821', 2: '#18222e', 3: '#223040' },
        accent: { DEFAULT: '#2dd4bf', dim: '#0f766e' },
        warn: '#f59e0b',
        danger: '#ef4444',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        popIn: { from: { opacity: 0, transform: 'translateY(14px) scale(.97)' }, to: { opacity: 1, transform: 'none' } },
        slideUp: { from: { opacity: 0, transform: 'translateY(24px)' }, to: { opacity: 1, transform: 'none' } },
        glowPulse: { '0%,100%': { boxShadow: '0 0 0 0 rgba(45,212,191,.55)' }, '50%': { boxShadow: '0 0 0 10px rgba(45,212,191,0)' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        shimmer: { from: { backgroundPosition: '0% 50%' }, to: { backgroundPosition: '200% 50%' } },
      },
      animation: {
        fadeIn: 'fadeIn .25s ease-out both',
        popIn: 'popIn .32s cubic-bezier(.2,.8,.2,1) both',
        slideUp: 'slideUp .6s cubic-bezier(.2,.8,.2,1) both',
        glowPulse: 'glowPulse 1.8s ease-out infinite',
        floaty: 'floaty 4s ease-in-out infinite',
        shimmer: 'shimmer 6s linear infinite',
      },
      fontFamily: {
        tech: ['Orbitron', 'Rajdhani', 'Inter', 'system-ui', 'sans-serif'],
        techsub: ['Rajdhani', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
