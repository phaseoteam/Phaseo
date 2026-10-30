import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { staticAssetsAdapter } from "@vinext/cloudflare/cache/static-assets-adapter";

const root = import.meta.dirname;
const sourceExtensions = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

// tsconfig maps `@/app/(dashboard)/*` to two folders and TypeScript/Next try
// each in turn. Vite only uses the first, so resolve the fallbacks here.
const aliasFallbacks: Array<[string, string[]]> = [
  ["@/app/(dashboard)/", ["src/app/[locale]/(dashboard)/", "src/app/(dashboard)/"]],
  ["@/app/(auth)/", ["src/app/[locale]/(auth)/"]],
  ["@/app/(legal)/", ["src/app/[locale]/(legal)/"]],
];

function findSourceFile(base: string): string | undefined {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const ext of sourceExtensions) {
    if (fs.existsSync(base + ext)) return base + ext;
  }
  for (const ext of sourceExtensions) {
    const index = path.join(base, `index${ext}`);
    if (fs.existsSync(index)) return index;
  }
  return undefined;
}

function tsconfigFallbackAliases(): Plugin {
  return {
    name: "phaseo:tsconfig-fallback-aliases",
    enforce: "pre",
    resolveId(source) {
      // vinext rewrites the alias to its first target before plugins run,
      // e.g. `/src/app/[locale]/(dashboard)/x`, so match that form too.
      const rewritten = source.replace(/\\/g, "/").replace(/^.*?\/src\/app\/\[locale\]\/\(dashboard\)\//, "@/app/(dashboard)/");
      if (rewritten !== source && findSourceFile(path.join(root, source.replace(/^.*?\/src\//, "src/")))) {
        return null;
      }
      source = rewritten;
      for (const [prefix, targets] of aliasFallbacks) {
        if (!source.startsWith(prefix)) continue;
        const rest = source.slice(prefix.length);
        for (const target of targets) {
          const found = findSourceFile(path.join(root, target, rest));
          if (found) return found;
        }
      }
      return null;
    },
  };
}

// A Worker isolate has 128 MB and holds the source of every uploaded module,
// so keep code the server never runs out of the server bundles.
const SERVER_STUB_PREFIX = "\0phaseo-server-stub:";
const MESSAGE_ASSET_MODULE = "\0phaseo-message-assets";
const messagesDir = path.join(root, "messages");

function isServerEnvironment(name: string | undefined): boolean {
  return name === "rsc" || name === "ssr";
}

// Blog/announcements and the help centre read src/content with node:fs.
// Workers have no filesystem: serve the files as static assets and answer
// readdir/stat from a manifest captured at build time.
const CONTENT_FS_MODULE = "\0phaseo-content-fs";
const contentDir = path.join(root, "src", "content");
const CONTENT_FS_IMPORTERS = ["/src/lib/content/announcements.ts", "/src/lib/content/helpCenter.ts"];

function listContentFiles(dir = contentDir): Array<{ rel: string; size: number; mtimeMs: number }> {
  const out: Array<{ rel: string; size: number; mtimeMs: number }> = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listContentFiles(full));
    else if (entry.isFile()) {
      const stat = fs.statSync(full);
      out.push({ rel: path.relative(contentDir, full).replace(/\\/g, "/"), size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return out;
}

function contentFsModuleSource(): string {
  const files = listContentFiles();
  return `
import { env } from "cloudflare:workers";
const FILES = new Map(${JSON.stringify(files.map((f) => [f.rel, { size: f.size, mtimeMs: f.mtimeMs }]))});
const DIRS = new Set([""]);
for (const rel of FILES.keys()) { const parts = rel.split("/"); for (let i = 1; i < parts.length; i++) DIRS.add(parts.slice(0, i).join("/")); }
function relOf(p) {
  const s = String(p instanceof URL ? p.pathname : p).replace(/\\\\/g, "/");
  const i = s.indexOf("src/content");
  if (i < 0) return null;
  return s.slice(i + "src/content".length).replace(/^\\/+|\\/+$/g, "");
}
function enoent(p, op) { const e = new Error(\`ENOENT: no such file or directory, \${op} '\${p}'\`); e.code = "ENOENT"; return e; }
function dirent(name, isDir) { return { name, isFile: () => !isDir, isDirectory: () => isDir, isSymbolicLink: () => false }; }
const cache = new Map();
async function readText(rel) {
  let pending = cache.get(rel);
  if (!pending) {
    pending = env.ASSETS.fetch(new Request("https://assets.invalid/_content/" + rel.split("/").map(encodeURIComponent).join("/"))).then((r) => {
      if (!r.ok) throw enoent(rel, "open");
      return r.text();
    });
    cache.set(rel, pending);
    pending.catch(() => cache.delete(rel));
  }
  return pending;
}
export const promises = {
  async readdir(p, options) {
    const rel = relOf(p);
    if (rel === null || !DIRS.has(rel)) throw enoent(p, "scandir");
    const prefix = rel ? rel + "/" : "";
    const names = new Map();
    for (const f of FILES.keys()) if (f.startsWith(prefix)) { const rest = f.slice(prefix.length); const name = rest.split("/")[0]; names.set(name, names.get(name) || rest.includes("/")); }
    for (const d of DIRS) if (d.startsWith(prefix) && d !== rel) { const name = d.slice(prefix.length).split("/")[0]; if (name) names.set(name, true); }
    const sorted = [...names].sort((a, b) => a[0].localeCompare(b[0]));
    return options && options.withFileTypes ? sorted.map(([n, isDir]) => dirent(n, isDir)) : sorted.map(([n]) => n);
  },
  async readFile(p, options) {
    const rel = relOf(p);
    if (rel === null || !FILES.has(rel)) throw enoent(p, "open");
    const text = await readText(rel);
    const encoding = typeof options === "string" ? options : options && options.encoding;
    return encoding ? text : new TextEncoder().encode(text);
  },
  async stat(p) {
    const rel = relOf(p);
    if (rel === null) throw enoent(p, "stat");
    if (FILES.has(rel)) { const f = FILES.get(rel); return { size: f.size, mtimeMs: f.mtimeMs, mtime: new Date(f.mtimeMs), isFile: () => true, isDirectory: () => false }; }
    if (DIRS.has(rel)) return { size: 0, mtimeMs: 0, mtime: new Date(0), isFile: () => false, isDirectory: () => true };
    throw enoent(p, "stat");
  },
  async access(p) {
    const rel = relOf(p);
    if (rel === null || (!FILES.has(rel) && !DIRS.has(rel))) throw enoent(p, "access");
  },
};
export default { promises };
`;
}

function workersMemoryTrim(): Plugin {
  return {
    name: "phaseo:workers-memory-trim",
    enforce: "pre",
    resolveId(source) {
      if (!isServerEnvironment(this.environment?.name)) return null;
      if (source === "virtual:phaseo-message-assets") return MESSAGE_ASSET_MODULE;
      if (source === "virtual:phaseo-content-fs") return CONTENT_FS_MODULE;
      // Syntax highlighting only runs in the browser (useEffect / streamdown),
      // so the server needs none of shiki's grammars, themes or WASM engine.
      if (/^@shikijs\/langs\//.test(source)) return `${SERVER_STUB_PREFIX}lang`;
      if (/^@shikijs\/themes\//.test(source)) return `${SERVER_STUB_PREFIX}theme`;
      if (source === "shiki/wasm" || /^@shikijs\/engine-oniguruma\/wasm-inlined/.test(source)) return `${SERVER_STUB_PREFIX}wasm`;
      // The docs search index is loaded when the command palette opens.
      if (/Search\.docs\.([\w-]+\.)?generated\.json$/.test(source)) return `${SERVER_STUB_PREFIX}json-array`;
      return null;
    },
    load(id) {
      if (id === CONTENT_FS_MODULE) return contentFsModuleSource();
      if (id === MESSAGE_ASSET_MODULE) {
        return [
          'import { env } from "cloudflare:workers";',
          "const loaded = new Map();",
          "export function loadMessageAsset(name) {",
          "  let pending = loaded.get(name);",
          "  if (!pending) {",
          '    pending = env.ASSETS.fetch(new Request(`https://assets.invalid/_messages/${name}.json`)).then(async (response) => {',
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
      if (kind === "wasm") return "export default () => Promise.reject(new Error(\"shiki is browser-only in this build\"));";
      return "export default [];";
    },
    transform(code, id) {
      // Locale catalogues: fetch the JSON from static assets at runtime
      // instead of bundling all nine locales into the Worker.
      if (!isServerEnvironment(this.environment?.name)) return null;
      const normalizedId = id.replace(/\\/g, "/");
      if (CONTENT_FS_IMPORTERS.some((suffix) => normalizedId.endsWith(suffix))) {
        const rewritten = code.replace(/import\s*\{\s*promises as fs\s*\}\s*from\s*"node:fs";/, 'import { promises as fs } from "virtual:phaseo-content-fs";');
        if (rewritten === code) this.error(`content fs shim: expected a node:fs promises import in ${id}`);
        return { code: rewritten, map: null };
      }
      if (!normalizedId.endsWith("/src/i18n/message-catalogs.ts")) return null;
      let count = 0;
      const out = code.replace(/import\(\s*"\.\.\/\.\.\/messages\/([\w-]+\/[\w.-]+)\.json"\s*\)/g, (_m, name) => {
        count++;
        return `__phaseoLoadMessageAsset(${JSON.stringify(name)})`;
      });
      if (count === 0) return null;
      return { code: `import { loadMessageAsset as __phaseoLoadMessageAsset } from "virtual:phaseo-message-assets";\n${out}`, map: null };
    },
    generateBundle() {
      // Publish the catalogues as static assets from the client build.
      if (this.environment?.name !== "client") return;
      for (const file of listContentFiles()) {
        this.emitFile({ type: "asset", fileName: `_content/${file.rel}`, source: fs.readFileSync(path.join(contentDir, file.rel)) });
      }
      for (const locale of fs.readdirSync(messagesDir)) {
        const localeDir = path.join(messagesDir, locale);
        if (!fs.statSync(localeDir).isDirectory()) continue;
        for (const file of fs.readdirSync(localeDir)) {
          if (!file.endsWith(".json")) continue;
          this.emitFile({ type: "asset", fileName: `_messages/${locale}/${file}`, source: fs.readFileSync(path.join(localeDir, file)) });
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [
    tsconfigFallbackAliases(),
    workersMemoryTrim(),
    vinext({
      cache: { cdn: staticAssetsAdapter() },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
