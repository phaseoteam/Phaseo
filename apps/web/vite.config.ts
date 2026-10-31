import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { announcementMdx, contentFilesystem, inlineVercelOgFont, latin1ServerChunks, workersMemoryTrim } from "./vite/plugins";
import { createBlogHeadingsPlugin } from "./src/lib/content/blogToc";

const root = import.meta.dirname;
const src = path.join(root, "src");

export default defineConfig(({ mode }) => {
	// Inline PUBLIC_* settings (process.env.PUBLIC_X) into client and server code at build time.
	const env = loadEnv(mode, root, "PUBLIC_");
	const define: Record<string, string> = Object.fromEntries(Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)]));
	define.__PHASEO_BUILD_ID__ = JSON.stringify(process.env.PHASEO_BUILD_ID ?? new Date().toISOString().replace(/[^0-9]/g, ""));

	return {
		publicDir: path.join(root, "public"),
		define,
		resolve: {
			alias: [
				{ find: /^@\/(.*)$/, replacement: `${src}/$1` },
			],
		},
		plugins: [
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
