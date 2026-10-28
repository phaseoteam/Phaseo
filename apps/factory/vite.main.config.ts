import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/main",
		emptyOutDir: true,
		target: "node22",
		lib: {
			entry: "src/main/index.ts",
			formats: ["es"],
			fileName: () => "index.mjs",
		},
		rollupOptions: {
			// The Agent SDK finds the Claude Code it ships with next to itself, so it stays in node_modules.
			external: ["electron", "@anthropic-ai/claude-agent-sdk", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
		},
	},
});
