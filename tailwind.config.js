/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "media", // suit la préférence OS automatiquement
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7ff",
          100: "#d9ecff",
          500: "#1976D2",
          600: "#1565C0",
          700: "#0D47A1",
        },
      },
    },
  },
  plugins: [],
};
