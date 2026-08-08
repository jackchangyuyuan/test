import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/"]),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["apps/api/**", "*.config.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["apps/web/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
    },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  prettier,
]);
