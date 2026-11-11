/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        yt: {
          black: "#0f0f0f",
          dark: "#181818",
          surface: "#212121",
          chip: "#272727",
          hover: "#3f3f3f",
          border: "#303030",
          red: "#ff0000",
          text: "#f1f1f1",
          gray: "#aaaaaa",
        },
        tv: {
          bg: "#0f0f0f",
          card: "#181818",
          cardHover: "#282828",
          border: "#303030",
          accent: "#ffffff",
          highlight: "#ff0000",
        },
      },
      fontFamily: {
        sans: [
          "Roboto",
          "YouTube Sans",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
