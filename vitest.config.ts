import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@apis": path.resolve(__dirname, "./apis")
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
