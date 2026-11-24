import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.{test,spec}.{ts,tsx}", "src/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**", "dist/**", ".output/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/**/*.test.*",
        "src/**/*.spec.*",
        "src/routeTree.gen.ts",
        "src/integrations/supabase/types.ts",
        "src/components/ui/**",
      ],
      thresholds: {
        // Baseline starts at 0%; ratcheted up as B5.2-B5.14 land tests.
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
      },

    },
  },
});
