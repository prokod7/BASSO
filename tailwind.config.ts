import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        basso: {
          black: "#15120f",
          wine: "#5a111a",
          wineDark: "#3d0d13",
          gold: "#b99a5b",
          goldLight: "#d9c18b",
          cream: "#f5efe3",
          paper: "#fbf8f1",
          ink: "#2a241f"
        }
      },
      boxShadow: { premium: "0 18px 60px rgba(32, 19, 9, .12)" },
      borderRadius: { "4xl": "2rem" },
      fontFamily: { display: ["Georgia", "serif"], sans: ["Inter", "Arial", "sans-serif"] }
    }
  },
  plugins: []
};
export default config;
