/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      // Named stacking layers — use these (z-dropdown, z-overlay, z-modal,
      // z-toast) instead of ad-hoc z-[9999] escalation, so every floating
      // surface has a defined place in the stack.
      zIndex: {
        dropdown: "50",
        overlay: "90",
        modal: "100",
        toast: "110",
      },
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
