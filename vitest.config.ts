import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
    // DB tests share one database; run files sequentially to keep them independent.
    fileParallelism: false,
  },
});
