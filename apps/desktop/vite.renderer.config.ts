import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	root: ".",
	base: "./",
	server: {
		host: "127.0.0.1",
		port: 4100,
		strictPort: true,
	},
	build: {
		outDir: "dist/renderer",
		emptyOutDir: true,
		// Provider logos stay files: inlined, all ~260 of them (about 340 KB) would be parsed before the window paints.
		assetsInlineLimit: file => (file.replace(/\\/g, "/").includes("/public/logos/") ? false : undefined),
	},
});
