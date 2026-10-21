/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // REACH brand: confident teal-green, readable on white at all sizes.
        brand: {
          50: "#ecfdf7",
          100: "#d1fae9",
          200: "#a7f3d6",
          500: "#10a37f",
          600: "#0d8a6c",
          700: "#0b6e57",
          900: "#073d31",
        },
        ink: {
          900: "#111827",
          700: "#374151",
          500: "#6b7280",
          300: "#d1d5db",
          100: "#f3f4f6",
        },
      },
    },
  },
  plugins: [],
};
