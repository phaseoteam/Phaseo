// apps/web/eslint.config.mjs
import path from "node:path";
import next from "eslint-config-next";
import tseslint from "typescript-eslint";

export default [
	...next,
	...tseslint.configs.recommended,
	{
		ignores: [
			".next/**",
			"dist/**",
			"build/**",
			"node_modules/**",
			"coverage/**",
			"playwright.config.ts",
		],
	},
	{
		files: ["**/*.{ts,tsx}"],
		languageOptions: {
			parserOptions: {
				project: [path.resolve(import.meta.dirname, "./tsconfig.json")],
				tsconfigRootDir: path.resolve(import.meta.dirname),
				ecmaVersion: "latest",
				sourceType: "module",
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
			"react/no-unescaped-entities": "warn",
			"no-case-declarations": "off",
			"no-console": "warn",
			"no-mixed-spaces-and-tabs": "warn",
			"@next/next/no-img-element": "warn",
			"react-hooks/rules-of-hooks": "warn",
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/immutability": "warn",
			"react-hooks/static-components": "warn",
			"react-hooks/purity": "warn",
			"react-hooks/error-boundaries": "warn",
			"react-hooks/preserve-manual-memoization": "warn",
		},
	},
	{
		files: [
			"src/app/(dashboard)/models/**/*.{ts,tsx}",
			"src/app/(dashboard)/families/**/*.{ts,tsx}",
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
						{
							name: "@/lib/fetchers/models/getFamilyModels",
							importNames: ["default", "getFamilyModels"],
							message:
								"Use getFamilyModelsCached in public model surfaces.",
						},
						{
							name: "@/lib/fetchers/models/getModelPricing",
							importNames: ["default", "getModelPricing"],
							message:
								"Use getModelPricingCached in public model surfaces.",
						},
						{
							name: "@/lib/fetchers/models/getModelGatewayMetadata",
							importNames: ["default", "getModelGatewayMetadata"],
							message:
								"Use getModelGatewayMetadataCached in public model surfaces.",
						},
						{
							name: "@/lib/fetchers/models/getModelSubscriptionPlans",
							importNames: ["default", "getModelSubscriptionPlans"],
							message:
								"Use getModelSubscriptionPlansCached in public model surfaces.",
						},
						{
							name: "@/lib/fetchers/models/getModelTimeline",
							importNames: ["default", "getModelTimeline"],
							message:
								"Use getModelTimelineCached in public model surfaces.",
						},
						{
							name: "@/lib/fetchers/models/getModelAvailability",
							importNames: ["default", "getModelAvailability"],
							message:
								"Use getModelAvailabilityCached in public model surfaces.",
						},
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
