/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        // Wedding theme colors based on the image
        wedding: {
          50: '#fdf8f3', // Lightest cream
          100: '#f5efe6', // Light cream
          200: '#ede1d1', // Cream background
          300: '#e6d3bc', // Light brown
          400: '#d4b896', // Medium brown (input fields)
          500: '#c19a6b', // Warm brown (borders)
          600: '#a67c52', // Darker brown
          700: '#8b5a3c', // Deep brown
          800: '#704a3a', // Very deep brown
          900: '#5a3d2e', // Darkest brown
        },
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'wedding': '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
}
