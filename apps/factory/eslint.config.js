import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["dist/**", "release/**"] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx,mjs}"],
		languageOptions: {
			ecmaVersion: 2023,
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"@typescript-eslint/consistent-type-imports": "error",
		},
	},
);
