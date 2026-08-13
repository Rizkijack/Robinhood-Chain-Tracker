import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/**/*.test.ts",
      "lib/streaming/__tests__/**/*.test.ts",
      "**/__tests__/**/*.test.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
