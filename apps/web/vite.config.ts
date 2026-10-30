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

export default defineConfig({
  plugins: [
    tsconfigFallbackAliases(),
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
