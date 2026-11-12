import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{ ignores: ["dist/**", "release/**"] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			ecmaVersion: 2023,
			globals: { ...globals.browser, ...globals.node },
		},
		rules: {
			"@typescript-eslint/consistent-type-imports": "error",
			// Leaving keys out of a copy with a rest pattern is how fields are dropped.
			"@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
		},
	},
);
