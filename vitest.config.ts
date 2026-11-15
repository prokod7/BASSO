import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: { maxWorkers: 2, environment: "node", include: ["tests/**/*.test.{ts,tsx}", "src/tests/**/*.test.{ts,tsx}"], testTimeout: 30000, hookTimeout: 60000 }
});

