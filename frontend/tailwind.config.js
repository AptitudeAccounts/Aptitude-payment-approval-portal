/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12233F",
        paper: "#F6F3EC",
        slate: "#4C6280",
        brass: "#B8863B",
        approve: "#2F6F4F",
        reject: "#9C3B34",
        hold: "#A6752B",
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        body: ["Inter", "sans-serif"],
        mono: ["IBM Plex Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
