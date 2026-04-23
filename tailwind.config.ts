import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0a0b10",
        panel: "#11131a",
        accent: "#1ed760"
      }
    }
  },
  plugins: []
};

export default config;
