import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["client/src/__tests__/**/*.{test,spec}.{ts,tsx}", "server/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: [
        "server/app.ts",
        "server/helpers.ts",
        "client/src/lib/air.ts",
        "client/src/lib/ai.ts",
        "client/src/lib/url.ts",
        "client/src/lib/companion/**/*.ts",
        "client/src/hooks/use-companion-state.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
