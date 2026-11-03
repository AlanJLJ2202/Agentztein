import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "site/**", "**/.stills/**", ".claude/**", ".data/**", "packages/db/drizzle/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // The landing runs in the browser; its build and image tools run in Node (and drive a browser).
    files: ["apps/landing/**/*.{js,mjs}"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    // Vercel functions (Web Request/Response on Node) and the shared research package (browser and Node).
    files: ["api/**/*.js", "packages/research/**/*.js", "scripts/**/*.mjs"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The agent's core is code the agent rewrites about itself: no Node or browser globals at all, so `fetch`,
    // `process`, `require`… fail lint (the gate also scans for them). Its tests may use node:test and node:assert.
    files: ["packages/agent-core/src/**/*.js"],
    languageOptions: { globals: {} },
  },
  {
    files: ["packages/agent-core/test/**/*.mjs"],
    languageOptions: { globals: {} },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
