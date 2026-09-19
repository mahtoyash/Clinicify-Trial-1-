import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
export default [{ ignores: [".next/**", "node_modules/**", "coverage/**"] }, js.configs.recommended, { plugins: { "@next/next": nextPlugin }, rules: { "@next/next/no-html-link-for-pages": "off" } }];
