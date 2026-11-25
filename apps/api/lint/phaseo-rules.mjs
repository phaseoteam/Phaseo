// Local oxlint rules for the gateway, loaded through `jsPlugins` in .oxlintrc.json.
// The rule API is ESLint's, so these also run under ESLint unchanged.

/** Flags `import { z } from "zod"`. `import * as z` and type-only imports are fine. */
const noZodNamedZ = {
	meta: {
		type: "problem",
		docs: { description: "Import zod as a namespace so Worker bundles can drop what they do not use." },
		messages: {
			named:
				'Use `import * as z from "zod"`. The `z` export is one object holding all of zod (≈550 KiB: ~40 error-message locales, JSON Schema conversion), so the bundler cannot drop what we never use.',
		},
		schema: [],
	},
	create(context) {
		return {
			ImportDeclaration(node) {
				if (node.source.value !== "zod" || node.importKind === "type") return;
				for (const specifier of node.specifiers) {
					if (specifier.type !== "ImportSpecifier" || specifier.importKind === "type") continue;
					const imported = specifier.imported.type === "Identifier" ? specifier.imported.name : specifier.imported.value;
					if (imported === "z") context.report({ node: specifier, messageId: "named" });
				}
			},
		};
	},
};

export default {
	meta: { name: "phaseo" },
	rules: { "no-zod-named-z": noZodNamedZ },
};
