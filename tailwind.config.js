/** @type {import('tailwindcss').Config} */
const defaultTheme = require('tailwindcss/defaultTheme');
module.exports = {
  content: [
    "./templates/**/*.html",
    "./static/src/**/*.js"
  ],
  theme: {
    extend: {
      colors: {
        white: {
          900: '#EAEAEA',
          800: '#DCDCDC',
          700: '#AEAEAE',
        },
        gray: {
          900: '#808080',
          800: '#646464',
          700: '#373737',
          600: '#2F2F2F',
          500: '#1B1B1B',
        },
        'black-layer': '#121212',
        black: '#0F121D',
        'black-bg': '#040404',
        orange: {
          900: '#E06710',
          800: '#B25715',
          100: '#1E0D04',
        },
        'red': '#B00A0A',
        'red-bg': '#340F0F',
        'green': '#46A350',
        'green-bg': '#122B14'
      },
      fontFamily: {
        'editorial-new': ['PP Editorial New', 'fallback-font'],
        'neue-montreal': ['PP Neue Montreal', 'fallback-font']
      }
    },
    
  },
  plugins: [

  ],
}

