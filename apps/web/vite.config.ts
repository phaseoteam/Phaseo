import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { aliasFallbacks, announcementMdx, contentFilesystem, inlineVercelOgFont, latin1ServerChunks, serverActions, serverOnlyInClient, stripUseCache, workersMemoryTrim } from "./vite/plugins";
import { createBlogHeadingsPlugin } from "./src/lib/content/blogToc";

const root = import.meta.dirname;
const src = path.join(root, "src");
const compat = path.join(src, "compat");

export default defineConfig(({ mode }) => {
	// Expose NEXT_PUBLIC_* the way Next inlines them (process.env.NEXT_PUBLIC_X).
	const env = loadEnv(mode, root, "NEXT_PUBLIC_");
	const define: Record<string, string> = Object.fromEntries(Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]));
	define.__PHASEO_BUILD_ID__ = JSON.stringify(process.env.PHASEO_BUILD_ID ?? new Date().toISOString().replace(/[^0-9]/g, ""));

	return {
		publicDir: path.join(root, "public"),
		define,
		resolve: {
			alias: [
				// `@/app/(group)/…` has tsconfig fallbacks; the aliasFallbacks plugin resolves it.
				{ find: /^@\/(?!app\/\()(.*)$/, replacement: `${src}/$1` },
				{ find: /^next\/server$/, replacement: path.join(compat, "next-server.ts") },
				{ find: /^next\/cache$/, replacement: path.join(compat, "next-cache.ts") },
				{ find: /^next\/font\/google$/, replacement: path.join(compat, "next-font-google.ts") },
				{ find: /^@vercel\/analytics\/react$/, replacement: path.join(compat, "noop-modules.tsx") },
				{ find: /^next\/web-vitals$/, replacement: path.join(compat, "next-web-vitals.ts") },
				{ find: /^server-only$/, replacement: path.join(compat, "empty.ts") },
				{ find: /^client-only$/, replacement: path.join(compat, "empty.ts") },
			],
		},
		plugins: [
			aliasFallbacks(root),
			serverOnlyInClient(path.join(compat, "next-headers.ts"), path.join(compat, "next-headers.client.ts")),
			serverActions(src),
			stripUseCache(),
			inlineVercelOgFont(),
			contentFilesystem(path.join(src, "content")),
			workersMemoryTrim(path.join(root, "messages")),
			latin1ServerChunks(),
			announcementMdx(path.join(src, "content/announcements"), (toc) => createBlogHeadingsPlugin(toc as never)),
			cloudflare({ viteEnvironment: { name: "ssr" } }),
			tanstackStart({ srcDirectory: "src", router: { routesDirectory: "routes" } }),
			viteReact(),
			tailwindcss(),
		],
		server: { port: 3200 },
	};
});
