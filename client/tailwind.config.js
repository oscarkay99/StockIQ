/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base:    '#020617',
        surface: '#060d1f',
        card:    '#0b1629',
        raised:  '#0f1e35',
        rim:     'rgba(148,163,184,0.08)',
        'rim-hi':'rgba(148,163,184,0.16)',
        gain:    '#10b981',
        loss:    '#f43f5e',
        flat:    '#64748b',
        gold:    '#f59e0b',
        info:    '#3b82f6',
        violet:  '#8b5cf6',
        t1:      '#f1f5f9',
        t2:      '#94a3b8',
        t3:      '#475569',
        t4:      '#1e293b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      },
      backgroundImage: {
        'gain-glow': 'radial-gradient(ellipse at top, rgba(16,185,129,0.07) 0%, transparent 60%)',
        'loss-glow': 'radial-gradient(ellipse at top, rgba(244,63,94,0.07) 0%, transparent 60%)',
      },
    },
  },
  plugins: [],
};
