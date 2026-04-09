import tseslint from "typescript-eslint";

const maxLinesRule = [
	"warn",
	{ max: 1000, skipBlankLines: true, skipComments: true },
];

export default [
	{
		ignores: [
			"dist/**",
			"out/**",
			"node_modules/**",
			"coverage/**",
		],
	},
	{
		files: ["**/*.{ts,tsx,mts,cts}"],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				ecmaVersion: "latest",
				sourceType: "module",
			},
		},
		rules: {
			"max-lines": maxLinesRule,
		},
	},
	{
		files: ["**/*.{js,jsx,mjs,cjs}"],
		rules: {
			"max-lines": maxLinesRule,
		},
	},
];
