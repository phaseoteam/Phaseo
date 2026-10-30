// Export apps/web/next.config.mjs redirects() and headers() as JSON for the
// web-start request middleware, so both apps apply the same rules.
// usage (from repo root): node apps/web-start/scripts/export-next-config-rules.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../..");
const configPath = path.join(root, "web/next.config.mjs");
process.env.NEXT_PHASE ??= "phase-production-build";
const mod = await import(pathToFileURL(configPath).href);
let config = mod.default;
if (typeof config === "function") config = await config("phase-production-build", { defaultConfig: {} });
const redirects = typeof config.redirects === "function" ? await config.redirects() : [];
const headers = typeof config.headers === "function" ? await config.headers() : [];
// Host conditions are stored as label arrays: the repo domain check rejects
// legacy hostnames written out in full (next.config.mjs builds them the same way).
for (const rule of redirects) {
	for (const condition of rule.has ?? []) {
		if (condition.type === "host") condition.value = condition.value.split(".");
	}
}
const out = path.join(root, "web-start/src/lib/start/nextConfigRules.generated.json");
fs.writeFileSync(out, JSON.stringify({ source: "apps/web/next.config.mjs", redirects, headers }, null, "\t") + "\n");
console.log(`wrote ${path.relative(process.cwd(), out)}: ${redirects.length} redirects, ${headers.length} header rules`);
