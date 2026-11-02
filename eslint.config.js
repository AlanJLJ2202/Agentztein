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
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
);
