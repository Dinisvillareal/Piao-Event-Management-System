/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./resources/**/*.blade.php",
    "./resources/**/*.js",
    "./resources/**/*.vue",
    "./resources/**/*.ts",
    "./resources/**/*.jsx",
    "./resources/**/*.tsx",
  ],

  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Public Sans",
          "Instrument Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Segoe UI Symbol",
          "Noto Color Emoji",
        ],
        display: [
          "Lexend",
          "Public Sans",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        // Piao design system — brand palette (see resources/css/app.css for
        // the paper/canvas neutrals). Keep decorative color to these two
        // families; everything else is ink or a light neutral.
        sage: {
          50: "#EEF4F1",
          100: "#DCEAE5",
          200: "#B9D6CC",
          300: "#A2C9BC",
          400: "#82B4AA",
          500: "#6EA096",
          600: "#5F8F86",
          700: "#456F68",
          800: "#33534E",
          900: "#233A37",
        },
        gold: {
          50: "#FCF5E7",
          100: "#F8E9C9",
          300: "#EFCA85",
          400: "#E6B45A",
          500: "#DDA53F",
          600: "#C6953C",
          700: "#9C742C",
        },
        ink: {
          DEFAULT: "#1A1A1A",
          soft: "#37423F",
        },
      },
    },
  },

  plugins: [],
};
