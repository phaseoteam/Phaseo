import { defineConfig } from "vite";
import { builtinModules } from "node:module";

export default defineConfig({
	build: {
		outDir: "dist/main",
		emptyOutDir: true,
		lib: {
			// The store is also its own entry, so smoke fixtures seed chats through it (scripts/fixtures/workspaceFixture.mjs).
			entry: { index: "src/main/index.ts", pdfWorker: "src/main/pdfWorker.mjs", workspaceStore: "src/main/workspaceStore.ts" },
			formats: ["es"],
			fileName: (_format, name) => `${name}.mjs`,
		},
		rollupOptions: {
			external: ["electron", "node-pty", "@cursor/sdk", /^@modelcontextprotocol\/sdk(?:\/|$)/, ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
		},
	},
});
