import path from "node:path";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;
const src = path.join(root, "src");

// Unit tests run in Node without the Cloudflare and TanStack Start plugins.
// Files that need a DOM opt in with a `// @vitest-environment jsdom` docblock.
export default defineConfig({
	define: {
		__PHASEO_BUILD_ID__: JSON.stringify("test"),
	},
	resolve: {
		alias: [
			{ find: /^@\/(.*)$/, replacement: `${src}/$1` },
		],
	},
	plugins: [viteReact()],
	test: {
		environment: "node",
		include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
		// enumSnapshot.test.ts is a plain node:assert script that CI runs with tsx.
		exclude: ["**/node_modules/**", "tests/e2e/**", "scripts/catalogue/enumSnapshot.test.ts"],
		setupFiles: ["./vitest.setup.ts"],
		server: {
			deps: {
				// Query core decides "server or browser" when it loads. Process it
				// like source so vi.resetModules() can reload it with a window.
				inline: ["@tanstack/query-core", "@tanstack/react-query"],
			},
		},
		testTimeout: 60000,
	},
});
