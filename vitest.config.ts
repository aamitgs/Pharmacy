import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // RLS isolation checks share seeded tenants and hit the same DB
    // connection pool — run test files serially to avoid cross-file
    // interference and pool exhaustion.
    fileParallelism: false,
  },
});
