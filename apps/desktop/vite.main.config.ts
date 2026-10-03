import { defineConfig } from "vite";
import { builtinModules } from "node:module";

export default defineConfig({
	build: {
		outDir: "dist/main",
		emptyOutDir: true,
		lib: {
			entry: { index: "src/main/index.ts", pdfWorker: "src/main/pdfWorker.mjs" },
			formats: ["es"],
			fileName: (_format, name) => `${name}.mjs`,
		},
		rollupOptions: {
			external: ["electron", "node-pty", ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
		},
	},
});
