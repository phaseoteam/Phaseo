import tseslint from "typescript-eslint";

const maxLinesRule = [
	"warn",
	{ max: 1000, skipBlankLines: true, skipComments: true },
];

export default [
	{
		ignores: [
			"dist/**",
			"build/**",
			".wrangler/**",
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
		plugins: { "@typescript-eslint": tseslint.plugin },
		rules: {
			"max-lines": maxLinesRule,
			// Every Worker bundles everything it imports into one script that is parsed on each cold start.
			"no-restricted-syntax": [
				"error",
				{
					// (no-restricted-imports' importNames also flags `import * as z`, so match the named import.)
					selector: "ImportDeclaration[source.value='zod'] > ImportSpecifier[imported.name='z']",
					message:
						'Use `import * as z from "zod"`. The `z` export is one object holding all of zod (≈550 KiB: ~40 error-message locales, JSON Schema conversion), so the bundler cannot drop what we never use.',
				},
			],
			"@typescript-eslint/no-restricted-imports": [
				"error",
				{
					paths: [
						{
							name: "@supabase/supabase-js",
							allowTypeImports: true,
							message:
								"Use createClient from @/runtime/supabase-client. supabase-js also bundles storage, realtime and functions clients the gateway never uses.",
						},
						{
							name: "stripe",
							allowTypeImports: true,
							message: "Use @/lib/stripe/rest. The Stripe SDK is ~780 KiB for a handful of calls.",
						},
						{
							name: "music-metadata",
							message: "Use @/lib/audio/duration. music-metadata and file-type add ~440 KiB.",
						},
					],
				},
			],
		},
	},
	{
		// Not bundled into a Worker: tests, local scripts and tools.
		files: ["**/*.test.ts", "**/*.spec.ts", "tests/**", "scripts/**", "tools/**"],
		rules: { "no-restricted-syntax": "off", "@typescript-eslint/no-restricted-imports": "off" },
	},
	{
		files: ["**/*.{js,jsx,mjs,cjs}"],
		rules: {
			"max-lines": maxLinesRule,
		},
	},
];
