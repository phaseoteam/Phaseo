// Vite plugins that let the copied Next.js source run under TanStack Start.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

const isServerEnv = (name: string | undefined) => name === "ssr";

function walk(dir: string, out: string[] = []): string[] {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "__tests__") continue;
			walk(full, out);
		} else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\.[tj]sx?$/.test(entry.name)) out.push(full);
	}
	return out;
}

function hasModuleDirective(code: string, directive: string): boolean {
	// The directive must be the first statement (comments and blank lines allowed).
	const stripped = code.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
	return stripped.startsWith(`"${directive}"`) || stripped.startsWith(`'${directive}'`);
}

/**
 * Next.js server actions without Next: `"use server"` modules keep their code
 * on the server; browser bundles get stubs that POST to `/_actions`.
 */
export function serverActions(srcDir: string): Plugin {
	const VIRTUAL = "virtual:phaseo-server-action-registry";
	const RESOLVED = "\0" + VIRTUAL;
	let actionModules: string[] = [];
	const keyFor = (file: string) => path.relative(srcDir, file).replace(/\\/g, "/");
	return {
		name: "phaseo:server-actions",
		enforce: "pre",
		buildStart() {
			actionModules = walk(srcDir).filter((file) => hasModuleDirective(fs.readFileSync(file, "utf8"), "use server"));
		},
		resolveId(id) {
			return id === VIRTUAL ? RESOLVED : null;
		},
		load(id) {
			if (id !== RESOLVED) return null;
			const entries = actionModules.map((file) => `  ${JSON.stringify(keyFor(file))}: () => import(${JSON.stringify(file.replace(/\\/g, "/"))}),`);
			return `export const actionModules = {\n${entries.join("\n")}\n};\n`;
		},
		transform(code, id) {
			const file = id.split("?")[0];
			if (!/\.(tsx?|jsx?)$/.test(file) || file.includes("node_modules")) return null;
			if (!hasModuleDirective(code, "use server")) return null;
			if (isServerEnv(this.environment?.name)) return null;
			// Export names come from the source's value `export` statements
			// (type-only exports are skipped).
			const names = new Set<string>();
			for (const match of code.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
			for (const match of code.matchAll(/export\s*\{([^}]+)\}/g)) {
				for (const part of match[1].split(",")) {
					const name = part.trim().split(/\s+as\s+/).pop()?.trim();
					if (name && !name.startsWith("type ")) names.add(name);
				}
			}
			if (/export\s+default\s/.test(code)) names.add("default");
			const key = keyFor(file);
			const lines = [`import { createServerActionReference } from "@/compat/server-actions-client";`];
			for (const name of names) {
				const ref = `createServerActionReference(${JSON.stringify(key)}, ${JSON.stringify(name)})`;
				lines.push(name === "default" ? `export default ${ref};` : `export const ${name} = ${ref};`);
			}
			return { code: lines.join("\n") + "\n", map: null };
		},
	};
}

/** `"use cache"` directives have no meaning outside Next; drop them. */
export function stripUseCache(): Plugin {
	return {
		name: "phaseo:strip-use-cache",
		enforce: "pre",
		transform(code, id) {
			if (id.includes("node_modules") || !/\.(tsx?|jsx?)$/.test(id.split("?")[0])) return null;
			if (!/["']use cache(?::[^"']*)?["']/.test(code)) return null;
			return { code: code.replace(/^(\s*)["']use cache(?::[^"']*)?["'];?/gm, "$1"), map: null };
		},
	};
}

/**
 * tsconfig maps `@/app/(dashboard)/*` to two folders and TypeScript tries
 * both. Vite's alias only knows one target, so resolve the fallbacks here.
 */
export function aliasFallbacks(root: string): Plugin {
	const sourceExtensions = [".tsx", ".ts", ".jsx", ".js", ".mjs"];
	const fallbacks: Array<[string, string[]]> = [
		["@/app/(dashboard)/", ["src/app/[locale]/(dashboard)/", "src/app/(dashboard)/"]],
		["@/app/(auth)/", ["src/app/[locale]/(auth)/"]],
		["@/app/(legal)/", ["src/app/[locale]/(legal)/"]],
	];
	const find = (base: string) => {
		if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
		for (const ext of sourceExtensions) if (fs.existsSync(base + ext)) return base + ext;
		for (const ext of sourceExtensions) {
			const index = path.join(base, `index${ext}`);
			if (fs.existsSync(index)) return index;
		}
		return undefined;
	};
	return {
		name: "phaseo:alias-fallbacks",
		enforce: "pre",
		resolveId(source) {
			for (const [prefix, targets] of fallbacks) {
				if (!source.startsWith(prefix)) continue;
				for (const target of targets) {
					const found = find(path.join(root, target, source.slice(prefix.length)));
					if (found) return found;
				}
			}
			return null;
		},
	};
}


/**
 * `next/headers` and `@tanstack/react-start/server` must never reach browser
 * bundles. Client-reachable modules that import them get a stub that throws
 * if called, mirroring Next's server-only boundary.
 */
export function serverOnlyInClient(serverPath: string, clientStubPath: string): Plugin {
	return {
		name: "phaseo:server-only-in-client",
		enforce: "pre",
		resolveId(source) {
			if (source !== "next/headers") return null;
			return isServerEnv(this.environment?.name) ? serverPath : clientStubPath;
		},
	};
}

/**
 * @vercel/og's edge build fetches its fallback font with
 * `new URL("./Geist-Regular.ttf", import.meta.url)` at module load, which is
 * not a fetchable URL inside a Worker. Inline the font instead.
 */
export function inlineVercelOgFont(): Plugin {
	return {
		name: "phaseo:inline-vercel-og-font",
		enforce: "pre",
		transform(code, id) {
			const file = id.split("?")[0].replace(/\\/g, "/");
			if (!file.includes("/@vercel/og/dist/index.edge.js")) return null;
			const fontPath = path.join(path.dirname(file), "Geist-Regular.ttf");
			const base64 = fs.readFileSync(fontPath).toString("base64");
			const replaced = code.replace(
				/fetch\(\s*new URL\("\.\/Geist-Regular\.ttf", import\.meta\.url\)\s*\)\.then\(\(res\) => res\.arrayBuffer\(\)\)/,
				`Promise.resolve(Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0)).buffer)`,
			);
			if (replaced === code) this.error("@vercel/og: fallback font fetch not found; update phaseo:inline-vercel-og-font");
			return { code: replaced, map: null };
		},
	};
}


// ---------------------------------------------------------------------------
// Content that Next read from disk at request time. Workers have no
// filesystem, so src/content is served as static assets and the readdir/stat
// answers come from a manifest captured at build time.
const CONTENT_FS_MODULE = "\0phaseo-content-fs";
const CONTENT_FS_IMPORTERS = ["/src/lib/content/announcements.ts", "/src/lib/content/helpCenter.ts"];

function listFiles(dir: string, base = dir): Array<{ rel: string; size: number; mtimeMs: number }> {
	const out: Array<{ rel: string; size: number; mtimeMs: number }> = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...listFiles(full, base));
		else if (entry.isFile()) {
			const stat = fs.statSync(full);
			out.push({ rel: path.relative(base, full).replace(/\\/g, "/"), size: stat.size, mtimeMs: stat.mtimeMs });
		}
	}
	return out;
}

export function contentFilesystem(contentDir: string): Plugin {
	return {
		name: "phaseo:content-fs",
		enforce: "pre",
		resolveId(source) {
			if (source === "virtual:phaseo-content-fs") return CONTENT_FS_MODULE;
			return null;
		},
		load(id) {
			if (id !== CONTENT_FS_MODULE) return null;
			const files = listFiles(contentDir).map((f) => [f.rel, { size: f.size, mtimeMs: f.mtimeMs }]);
			return [
				'import { env } from "cloudflare:workers";',
				`const FILES = new Map(${JSON.stringify(files)});`,
				'const DIRS = new Set([""]);',
				'for (const rel of FILES.keys()) { const parts = rel.split("/"); for (let i = 1; i < parts.length; i++) DIRS.add(parts.slice(0, i).join("/")); }',
				'function relOf(p) { const s = String(p instanceof URL ? p.pathname : p).replace(/\\\\/g, "/"); const i = s.indexOf("src/content"); if (i < 0) return null; return s.slice(i + "src/content".length).replace(/^\\/+|\\/+$/g, ""); }',
				'function enoent(p, op) { const e = new Error(`ENOENT: no such file or directory, ${op} \'${p}\'`); e.code = "ENOENT"; return e; }',
				'function dirent(name, isDir) { return { name, isFile: () => !isDir, isDirectory: () => isDir, isSymbolicLink: () => false }; }',
				'const cache = new Map();',
				'function readText(rel) { let pending = cache.get(rel); if (!pending) { pending = env.ASSETS.fetch(new Request("https://assets.invalid/_content/" + rel.split("/").map(encodeURIComponent).join("/"))).then((r) => { if (!r.ok) throw enoent(rel, "open"); return r.text(); }); cache.set(rel, pending); pending.catch(() => cache.delete(rel)); } return pending; }',
				'export const promises = {',
				'  async readdir(p, options) { const rel = relOf(p); if (rel === null || !DIRS.has(rel)) throw enoent(p, "scandir"); const prefix = rel ? rel + "/" : ""; const names = new Map(); for (const f of FILES.keys()) if (f.startsWith(prefix)) { const rest = f.slice(prefix.length); names.set(rest.split("/")[0], names.get(rest.split("/")[0]) || rest.includes("/")); } const sorted = [...names].sort((a, b) => a[0].localeCompare(b[0])); return options && options.withFileTypes ? sorted.map(([n, d]) => dirent(n, d)) : sorted.map(([n]) => n); },',
				'  async readFile(p, options) { const rel = relOf(p); if (rel === null || !FILES.has(rel)) throw enoent(p, "open"); const text = await readText(rel); const enc = typeof options === "string" ? options : options && options.encoding; return enc ? text : new TextEncoder().encode(text); },',
				'  async stat(p) { const rel = relOf(p); if (rel === null) throw enoent(p, "stat"); if (FILES.has(rel)) { const f = FILES.get(rel); return { size: f.size, mtimeMs: f.mtimeMs, mtime: new Date(f.mtimeMs), isFile: () => true, isDirectory: () => false }; } if (DIRS.has(rel)) return { size: 0, mtimeMs: 0, mtime: new Date(0), isFile: () => false, isDirectory: () => true }; throw enoent(p, "stat"); },',
				'  async access(p) { const rel = relOf(p); if (rel === null || (!FILES.has(rel) && !DIRS.has(rel))) throw enoent(p, "access"); },',
				'};',
				'export default { promises };',
			].join("\n");
		},
		transform(code, id) {
			const normalizedId = id.split("?")[0].replace(/\\/g, "/");
			if (!CONTENT_FS_IMPORTERS.some((suffix) => normalizedId.endsWith(suffix))) return null;
			// Browser bundles reach these modules for their helpers; the content
			// directory constants run at module load, where `process` is undefined.
			if (this.environment?.name === "client") return { code: code.replaceAll("process.cwd()", '"/"'), map: null };
			if (this.environment?.name !== "ssr") return null;
			const rewritten = code.replace(/import\s*\{\s*promises as fs\s*\}\s*from\s*"node:fs";/, 'import { promises as fs } from "virtual:phaseo-content-fs";');
			if (rewritten === code) this.error(`content fs: expected a node:fs promises import in ${id}`);
			return { code: rewritten, map: null };
		},
		generateBundle() {
			if (this.environment?.name !== "client") return;
			for (const file of listFiles(contentDir)) {
				this.emitFile({ type: "asset", fileName: `_content/${file.rel}`, source: fs.readFileSync(path.join(contentDir, file.rel)) });
			}
		},
	};
}

// ---------------------------------------------------------------------------
// Blog posts: Next compiled MDX per request (compileMDX), which Workers cannot
// do (no runtime code evaluation). Compile every post at build time instead;
// each module exports the content component and its table of contents.
const MDX_REGISTRY = "\0phaseo-announcement-mdx";

export function announcementMdx(announcementsDir: string, createHeadingsPlugin: (toc: unknown[]) => unknown): Plugin {
	return {
		name: "phaseo:announcement-mdx",
		enforce: "pre",
		resolveId(source) {
			if (source === "virtual:phaseo-announcement-mdx") return MDX_REGISTRY;
			if (source.endsWith("?phaseo-mdx")) return source;
			return null;
		},
		async load(id) {
			if (id === MDX_REGISTRY) {
				const entries = listFiles(announcementsDir).filter((f) => /\.mdx?$/.test(f.rel)).map((f) =>
					`  ${JSON.stringify(f.rel)}: () => import(${JSON.stringify(path.join(announcementsDir, f.rel).replace(/\\/g, "/") + "?phaseo-mdx")}),`,
				);
				return `export const announcementModules = {\n${entries.join("\n")}\n};\n`;
			}
			if (!id.endsWith("?phaseo-mdx")) return null;
			const file = id.slice(0, -"?phaseo-mdx".length);
			const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
			// Same frontmatter split as parseDocument() in lib/content/announcements.ts.
			const match = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
			const body = (match ? raw.slice(match[0].length) : raw).trim();
			const toc: unknown[] = [];
			const [{ compile }, { default: remarkGfm }] = await Promise.all([import("@mdx-js/mdx"), import("remark-gfm")]);
			const compiled = await compile(body, { remarkPlugins: [remarkGfm, createHeadingsPlugin(toc) as never], jsxImportSource: "react", development: false });
			return `${String(compiled)}\nexport const toc = ${JSON.stringify(toc)};\n`;
		},
	};
}

// ---------------------------------------------------------------------------
// Worker memory: an isolate holds the source of every uploaded module (2 bytes
// a character once a file has any non-Latin1 text) inside its 128 MB limit.
// Translations load from static assets at runtime, and the server bundle skips
// code that only runs in the browser (syntax highlighting, docs search).
const MESSAGE_ASSETS_MODULE = "\0phaseo-message-assets";
const SERVER_STUB_PREFIX = "\0phaseo-server-stub:";

export function workersMemoryTrim(messagesDir: string): Plugin {
	return {
		name: "phaseo:workers-memory-trim",
		enforce: "pre",
		resolveId(source) {
			if (!isServerEnv(this.environment?.name)) return null;
			if (source === "virtual:phaseo-message-assets") return MESSAGE_ASSETS_MODULE;
			// Shiki highlights in effects only, so the server needs no grammars,
			// themes or WASM engine.
			if (/^@shikijs\/langs\//.test(source)) return `${SERVER_STUB_PREFIX}lang`;
			if (/^@shikijs\/themes\//.test(source)) return `${SERVER_STUB_PREFIX}theme`;
			if (source === "shiki/wasm" || /^@shikijs\/engine-oniguruma\/wasm-inlined/.test(source)) return `${SERVER_STUB_PREFIX}wasm`;
			// The docs search index loads when the command palette opens.
			if (/Search\.docs\.([\w-]+\.)?generated\.json$/.test(source)) return `${SERVER_STUB_PREFIX}json-array`;
			return null;
		},
		load(id) {
			if (id === MESSAGE_ASSETS_MODULE) {
				return [
					'import { env } from "cloudflare:workers";',
					"const loaded = new Map();",
					"export function loadMessageAsset(name) {",
					"  let pending = loaded.get(name);",
					"  if (!pending) {",
					"    pending = env.ASSETS.fetch(new Request(`https://assets.invalid/_messages/${name}.json`)).then(async (response) => {",
					"      if (!response.ok) throw new Error(`Message catalogue ${name} returned ${response.status}`);",
					"      return { default: await response.json() };",
					"    });",
					"    loaded.set(name, pending);",
					"    pending.catch(() => loaded.delete(name));",
					"  }",
					"  return pending;",
					"}",
				].join("\n");
			}
			if (!id.startsWith(SERVER_STUB_PREFIX)) return null;
			const kind = id.slice(SERVER_STUB_PREFIX.length);
			if (kind === "lang") return "export default [];";
			if (kind === "theme") return 'export default { name: "none", type: "light", colors: {}, tokenColors: [], fg: "#000000", bg: "#ffffff" };';
			if (kind === "wasm") return 'export default () => Promise.reject(new Error("shiki is browser-only in this build"));';
			return "export default [];";
		},
		transform(code, id) {
			if (!isServerEnv(this.environment?.name)) return null;
			if (!id.split("?")[0].replace(/\\/g, "/").endsWith("/src/i18n/message-catalogs.ts")) return null;
			let count = 0;
			const out = code.replace(/import\(\s*"\.\.\/\.\.\/messages\/([\w-]+\/[\w.-]+)\.json"\s*\)/g, (_match, name: string) => {
				count++;
				return `__phaseoLoadMessageAsset(${JSON.stringify(name)})`;
			});
			if (count === 0) this.error("message assets: expected locale catalogue imports in message-catalogs.ts");
			return { code: `import { loadMessageAsset as __phaseoLoadMessageAsset } from "virtual:phaseo-message-assets";\n${out}`, map: null };
		},
		generateBundle() {
			// Publish the catalogues with the client build's static assets.
			if (this.environment?.name !== "client") return;
			for (const locale of fs.readdirSync(messagesDir)) {
				const localeDir = path.join(messagesDir, locale);
				if (!fs.statSync(localeDir).isDirectory()) continue;
				for (const file of fs.readdirSync(localeDir)) {
					if (file.endsWith(".json")) this.emitFile({ type: "asset", fileName: `_messages/${locale}/${file}`, source: fs.readFileSync(path.join(localeDir, file)) });
				}
			}
		},
	};
}

/**
 * Escape non-Latin1 characters in server chunks where that makes the module
 * cheaper to hold: a file with one "→" otherwise costs 2 bytes per character.
 * Mostly-CJK files stay as they are (an escape is 6 bytes).
 */
export function latin1ServerChunks(): Plugin {
	return {
		name: "phaseo:latin1-server-chunks",
		applyToEnvironment: (environment) => isServerEnv(environment.name),
		// generateBundle sees each chunk's final code, after every renderChunk hook.
		generateBundle(_options, bundle) {
			for (const chunk of Object.values(bundle)) {
				if (chunk.type !== "chunk") continue;
				const nonLatin1 = chunk.code.match(/[^\x00-\xff]/g);
				if (!nonLatin1) continue;
				const escapedLength = chunk.code.length + nonLatin1.length * 5;
				if (escapedLength >= chunk.code.length * 2) continue;
				chunk.code = chunk.code.replace(/[^\x00-\xff]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
			}
		},
	};
}
