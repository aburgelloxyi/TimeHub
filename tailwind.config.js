/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Geist Variable"', "Geist", "system-ui", "-apple-system",
          "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif",
        ],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
