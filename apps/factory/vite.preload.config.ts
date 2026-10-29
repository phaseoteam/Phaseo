import { defineConfig } from "vite";

export default defineConfig({
	build: {
		outDir: "dist/preload",
		emptyOutDir: true,
		lib: {
			entry: "src/preload/index.ts",
			formats: ["cjs"],
			fileName: () => "index.cjs",
		},
		rollupOptions: {
			external: ["electron"],
		},
	},
});
