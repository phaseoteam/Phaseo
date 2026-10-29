import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	root: ".",
	base: "./",
	server: {
		host: "127.0.0.1",
		port: 4300,
		strictPort: true,
	},
	build: {
		outDir: "dist/renderer",
		emptyOutDir: true,
	},
});
