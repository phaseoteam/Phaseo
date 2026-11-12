import { defineConfig, type Plugin } from "vitest/config";

// Tests run on Node. The Workers runtime module is replaced by a small stand-in
// so the Durable Objects can be constructed with a fake state (test/fakes.ts).
// WebAssembly and font imports load the way wrangler bundles them: a compiled
// module, and the font's bytes.
function binaryModules(): Plugin {
	return {
		name: "slack-agent-binary-modules",
		enforce: "pre",
		load(id) {
			const file = id.split("?")[0];
			if (file.endsWith(".wasm")) return `import { readFileSync } from "node:fs";\nexport default new WebAssembly.Module(readFileSync(${JSON.stringify(file)}));`;
			if (file.endsWith(".ttf")) return `import { readFileSync } from "node:fs";\nconst bytes = readFileSync(${JSON.stringify(file)});\nexport default bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);`;
			return null;
		},
	};
}

export default defineConfig({
	plugins: [binaryModules()],
	resolve: {
		alias: {
			"cloudflare:workers": new URL("./test/cloudflare-workers.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
		},
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		// So its .wasm goes through binaryModules, not Node's own WebAssembly imports.
		server: { deps: { inline: ["@resvg/resvg-wasm"] } },
	},
});
