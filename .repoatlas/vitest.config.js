import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [".repoatlas/tests/**/*.test.js"],
  },
});
