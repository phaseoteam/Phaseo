import { defineConfig } from "vitest/config";

// Tests run on Node. The Workers runtime module is replaced by a small stand-in
// so the Durable Objects can be constructed with a fake state (test/fakes.ts).
export default defineConfig({
	resolve: {
		alias: {
			"cloudflare:workers": new URL("./test/cloudflare-workers.ts", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
		},
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
	},
});
