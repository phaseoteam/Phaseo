import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { aliasFallbacks, serverActions, serverOnlyInClient, stripUseCache } from "./build/phaseo-plugins";

const root = import.meta.dirname;
const webRoot = path.resolve(root, "../web");
const src = path.join(root, "src");
const compat = path.join(src, "compat");

export default defineConfig(({ mode }) => {
	// Expose NEXT_PUBLIC_* the way Next inlines them (process.env.NEXT_PUBLIC_X).
	const env = { ...loadEnv(mode, webRoot, "NEXT_PUBLIC_"), ...loadEnv(mode, root, "NEXT_PUBLIC_") };
	const define: Record<string, string> = Object.fromEntries(Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]));
	define.__PHASEO_BUILD_ID__ = JSON.stringify(process.env.PHASEO_BUILD_ID ?? new Date().toISOString().replace(/[^0-9]/g, ""));

	return {
		publicDir: path.join(webRoot, "public"),
		define,
		resolve: {
			alias: [
				{ find: /^@\/(.*)$/, replacement: `${src}/$1` },
				{ find: /^next\/link$/, replacement: path.join(compat, "next-link.tsx") },
				{ find: /^next\/navigation$/, replacement: path.join(compat, "next-navigation.ts") },
				{ find: /^next\/image$/, replacement: path.join(compat, "next-image.tsx") },
				{ find: /^next\/dynamic$/, replacement: path.join(compat, "next-dynamic.tsx") },
				{ find: /^next\/script$/, replacement: path.join(compat, "next-script.tsx") },
				{ find: /^next\/server$/, replacement: path.join(compat, "next-server.ts") },
				{ find: /^next\/cache$/, replacement: path.join(compat, "next-cache.ts") },
				{ find: /^next\/og$/, replacement: path.join(compat, "next-og.ts") },
				{ find: /^next\/font\/google$/, replacement: path.join(compat, "next-font-google.ts") },
				{ find: /^next-intl\/server$/, replacement: path.join(compat, "next-intl-server.ts") },
				{ find: /^next-intl$/, replacement: path.join(compat, "next-intl.tsx") },
				{ find: /^@vercel\/analytics\/react$/, replacement: path.join(compat, "noop-modules.tsx") },
				{ find: /^next-navigation-guard$/, replacement: path.join(compat, "noop-modules.tsx") },
				{ find: /^nuqs\/adapters\/next\/app$/, replacement: "nuqs/adapters/tanstack-router" },
				{ find: /^server-only$/, replacement: path.join(compat, "empty.ts") },
				{ find: /^client-only$/, replacement: path.join(compat, "empty.ts") },
			],
		},
		plugins: [
			aliasFallbacks(root),
			serverOnlyInClient(path.join(compat, "next-headers.ts"), path.join(compat, "next-headers.client.ts")),
			serverActions(src),
			stripUseCache(),
			cloudflare({ viteEnvironment: { name: "ssr" } }),
			tanstackStart({ srcDirectory: "src", router: { routesDirectory: "routes" } }),
			viteReact(),
		],
		server: { port: 3200 },
	};
});
