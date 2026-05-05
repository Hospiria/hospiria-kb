import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0faf4',
          100: '#dcf2e6',
          200: '#b9e5cd',
          300: '#8acfaa',
          400: '#4db37e',
          500: '#2a9d5c',
          600: '#1f7d47',
          700: '#1A7A4A',
          800: '#155f39',
          900: '#10472b',
        },
        teal: {
          50: '#f0fdf6',
          100: '#dcfaeb',
          200: '#b8f4d6',
          300: '#7eeab5',
          400: '#3dd98a',
          500: '#2ECC71',
          600: '#22a85c',
          700: '#1a8047',
          800: '#166038',
          900: '#12502f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
