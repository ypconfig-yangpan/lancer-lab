import js from "@eslint/js";
import pluginQuery from "@tanstack/eslint-plugin-query";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      ".cargo-home/**",
      ".tanstack/**",
      "src/routeTree.gen.ts",
      "node_modules/**",
      "coverage/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-ignore": "allow-with-description",
          minimumDescriptionLength: 10,
        },
      ],
    },
  },
  {
    files: ["src/shared/logger/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },
  ...pluginQuery.configs["flat/recommended"],
);
