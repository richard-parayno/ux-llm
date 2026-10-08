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
      },
      backgroundImage: theme => ({
        'mesh-gradient': `
          linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)),
          radial-gradient(at 40% 20%, hsla(11,0%,0%,1) 0px, transparent 50%),
          radial-gradient(at 96% 48%, hsla(25,100%,50%,0.44) 0px, transparent 50%),
          radial-gradient(at 0% 50%, hsla(284,73%,20%,1) 0px, transparent 50%),
          radial-gradient(at 69% 69%, hsla(25,100%,50%,0.44) 0px, transparent 50%),
          radial-gradient(at 0% 100%, hsla(283,73%,23%,1) 0px, transparent 50%),
          radial-gradient(at 80% 100%, hsla(18,100%,55%,1) 0px, transparent 50%),
          radial-gradient(at 0% 0%, hsla(340,0%,0%,1) 0px, transparent 50%)
        `
      }),
      backgroundColor: {
        'base-mesh': 'hsla(0,0%,0%,1)'
      },
      backgroundPosition: {
        'grainy': '0 0, 1px 1px',
      },
      backgroundSize: {
        'grainy': '2px 2px'
      },
      opacity: {
        '40': '0.4',
        '50': '0.5',
        '100': '1.0'
      },
    },
    
  },
  plugins: [
    
  ],
  corePlugins: {
    transform: true,
    rotate: true,
  }
}

