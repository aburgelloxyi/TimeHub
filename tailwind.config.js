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
        display: [
          '"Bricolage Grotesque Variable"', '"Bricolage Grotesque"',
          '"Geist Variable"', "sans-serif",
        ],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
