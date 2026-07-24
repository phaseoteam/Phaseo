import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["dist/**", "build/**", ".wrangler/**", "node_modules/**", "coverage/**"],
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    rules: {
      "max-lines": ["warn", { max: 1000, skipBlankLines: true, skipComments: true }],
    },
  },
];
