// apps/web/eslint.config.mjs
import path from "node:path";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const cachedFetcherRule = (name, cachedName) => ({
	name: `@/lib/fetchers/models/${name}`,
	importNames: ["default", name],
	message: `Use ${cachedName} in public model surfaces.`,
});

export default [
	{
		ignores: [
			"dist/**",
			".tanstack/**",
			".wrangler/**",
			"node_modules/**",
			"coverage/**",
			"src/routeTree.gen.ts",
			"eslint.config.mjs",
			"playwright.config.ts",
		],
	},
	...tseslint.configs.recommended,
	// rules-of-hooks fails the lint; the React Compiler checks (set-state-in-effect,
	// refs, purity, ...) and exhaustive-deps warn.
	{
		...reactHooks.configs.flat.recommended,
		rules: {
			...Object.fromEntries(Object.keys(reactHooks.configs.flat.recommended.rules).map((rule) => [rule, "warn"])),
			"react-hooks/rules-of-hooks": "error",
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		plugins: { react },
		settings: { react: { version: "detect" } },
		rules: {
			"react/jsx-key": "warn",
			"react/no-unescaped-entities": "warn",
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			parserOptions: {
				// Includes tests, which the typecheck tsconfig leaves out.
				project: [path.resolve(import.meta.dirname, "./tsconfig.eslint.json")],
				tsconfigRootDir: path.resolve(import.meta.dirname),
				ecmaVersion: "latest",
				sourceType: "module",
				ecmaFeatures: { jsx: true },
			},
		},
		rules: {
			"max-lines": [
				"warn",
				{ max: 1000, skipBlankLines: true, skipComments: true },
			],
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"no-case-declarations": "off",
			"no-console": "warn",
			"no-mixed-spaces-and-tabs": "warn",
		},
	},
	{
		files: [
			"src/routes/*/_dashboard/models/**/*.{ts,tsx}",
			"src/routes/*/_dashboard/families/**/*.{ts,tsx}",
			"src/views/**/models/**/*.{ts,tsx}",
			"src/views/**/families/**/*.{ts,tsx}",
			"src/features/models/**/*.{ts,tsx}",
			"src/features/families/**/*.{ts,tsx}",
			"src/components/(data)/model/**/*.{ts,tsx}",
		],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@/lib/fetchers/models/getModel",
							importNames: ["default", "getModelOverview"],
							message:
								"Use getModelCached/getModelOverviewCached in public model surfaces.",
						},
						cachedFetcherRule("getFamilyModels", "getFamilyModelsCached"),
						cachedFetcherRule("getModelPricing", "getModelPricingCached"),
						cachedFetcherRule("getModelGatewayMetadata", "getModelGatewayMetadataCached"),
						cachedFetcherRule("getModelSubscriptionPlans", "getModelSubscriptionPlansCached"),
						cachedFetcherRule("getModelTimeline", "getModelTimelineCached"),
						cachedFetcherRule("getModelAvailability", "getModelAvailabilityCached"),
					],
				},
			],
		},
	},
	{
		files: ["**/*.{js,jsx,mjs,cjs}"],
		rules: {
			"max-lines": [
				"warn",
				{ max: 1000, skipBlankLines: true, skipComments: true },
			],
			"@typescript-eslint/no-require-imports": "off",
		},
	},
];
