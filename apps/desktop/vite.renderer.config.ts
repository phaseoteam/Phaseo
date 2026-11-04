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
		// Every lab logo is imported up front; inlined, they added ~300 KB to the script the window runs before its first
		// paint. As files, each loads only when a logo shows.
		assetsInlineLimit: 0,
	},
});
