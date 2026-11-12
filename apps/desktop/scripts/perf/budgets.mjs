// Startup budgets for the built desktop app, checked without timing anything, so they never flake on a busy machine.
//
//   pnpm --filter @phaseo/desktop perf:budgets            check dist/ against perf-budgets.json (run after a build)
//   pnpm --filter @phaseo/desktop perf:budgets --update   rewrite the byte budgets from this build, with headroom
//
// What it guards (each was a measured startup cost; see docs/performance.md, "Keeping startup fast"):
// - Packages loaded before the window: everything the main process imports up front, following static imports from
//   boot.mjs (and the index it loads). Only the allowlisted ones may be there; anything else (an SDK, a parser) must be
//   imported when first used. Resolving one heavy package through pnpm's links cost ~350 ms on Windows.
// - Bytes: the main process code loaded up front, the preload, and what the window loads before its first paint.
// - The compile cache is switched on in boot.mjs, and the window's HTML carries the logo shown while it loads.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { builtinModules } from "node:module";
import { gzipSync } from "node:zlib";
import { parseAst } from "vite";

const desktop = path.resolve(import.meta.dirname, "../..");
const dist = path.join(desktop, "dist"), budgetsFile = path.join(desktop, "perf-budgets.json");
const update = process.argv.includes("--update");
const kb = bytes => `${(bytes / 1024).toFixed(1)} KB`;
const builtins = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
if (!existsSync(path.join(dist, "main", "boot.mjs"))) { console.error("dist/ is missing: run `pnpm --filter @phaseo/desktop build` first."); process.exit(2); }

/** Static and dynamic import specifiers of one module, from its syntax tree. */
function imports(file) {
	const ast = parseAst(readFileSync(file, "utf8"));
	const found = { static: new Set(), dynamic: new Set() };
	const walk = node => {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node)) { node.forEach(walk); return; }
		if ((node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration" || node.type === "ExportNamedDeclaration") && node.source?.value) found.static.add(node.source.value);
		if (node.type === "ImportExpression" && node.source?.type === "Literal" && typeof node.source.value === "string") found.dynamic.add(node.source.value);
		for (const key in node) if (key !== "type" && node[key] && typeof node[key] === "object") walk(node[key]);
	};
	walk(ast);
	return found;
}
const packageName = specifier => specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];

/**
 * The modules loaded before the window: boot.mjs, the index it imports (its one awaited dynamic import) and every
 * local chunk reached by static imports. Returns the local files and the packages they import.
 */
function eagerMain() {
	const main = path.join(dist, "main"), files = new Set(), packages = new Map();
	const visit = file => {
		if (files.has(file)) return; files.add(file);
		const found = imports(file);
		const next = [...found.static, ...(path.basename(file) === "boot.mjs" ? found.dynamic : [])];
		for (const specifier of next) {
			if (specifier.startsWith(".")) visit(path.resolve(path.dirname(file), specifier));
			else if (!builtins.has(specifier) && !packages.has(packageName(specifier))) packages.set(packageName(specifier), path.relative(main, file).replace(/\\/g, "/"));
		}
	};
	visit(path.join(main, "boot.mjs"));
	return { files: [...files], packages };
}

/** What the renderer loads before its first paint: the entry script and stylesheets in index.html, and their static imports. */
function initialRenderer() {
	const renderer = path.join(dist, "renderer"), html = readFileSync(path.join(renderer, "index.html"), "utf8");
	const files = new Set();
	const visit = file => {
		if (files.has(file) || !existsSync(file)) return; files.add(file);
		if (file.endsWith(".js")) for (const specifier of imports(file).static) if (specifier.startsWith(".")) visit(path.resolve(path.dirname(file), specifier));
	};
	for (const match of html.matchAll(/(?:src|href)="\.?\/?([^"]+\.(?:js|css))"/g)) visit(path.join(renderer, match[1]));
	return { html, files: [...files] };
}

const bytes = files => files.reduce((sum, file) => sum + statSync(file).size, 0);
const gzipBytes = files => files.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
const main = eagerMain(), renderer = initialRenderer();
const preload = readdirSync(path.join(dist, "preload")).map(name => path.join(dist, "preload", name)).filter(file => statSync(file).isFile());
const measured = {
	mainEagerBytes: bytes(main.files),
	preloadBytes: bytes(preload),
	rendererInitialBytes: bytes(renderer.files),
	rendererInitialGzipBytes: gzipBytes(renderer.files),
};

if (update) {
	const current = existsSync(budgetsFile) ? JSON.parse(readFileSync(budgetsFile, "utf8")) : {};
	// 10% headroom over this build, rounded up to the next 10 KB, so ordinary changes pass and a real jump does not.
	const ceiling = value => Math.ceil((value * 1.1) / 10240) * 10240;
	const next = {
		$comment: "Startup budgets checked by scripts/perf/budgets.mjs. Raise a byte budget only with the reason in the pull request; add a package to eagerPackages only if the window can't open without it.",
		eagerPackages: current.eagerPackages ?? [...main.packages.keys()].sort(),
		bytes: Object.fromEntries(Object.entries(measured).map(([name, value]) => [name, ceiling(value)])),
	};
	writeFileSync(budgetsFile, `${JSON.stringify(next, null, "\t")}\n`);
	console.log(`Wrote ${path.relative(desktop, budgetsFile)}:`, next.bytes);
	process.exit(0);
}

const budgets = JSON.parse(readFileSync(budgetsFile, "utf8"));
const failures = [], rows = [];
const allowed = new Set(budgets.eagerPackages);
for (const [name, from] of main.packages) {
	const ok = allowed.has(name);
	rows.push([`Loaded before the window: ${name}`, ok ? "allowed" : `not allowed (imported by dist/main/${from})`, ok]);
	if (!ok) failures.push(`${name} is imported before the window opens (dist/main/${from}). Import it where it's first used, e.g. \`const { X } = await import("${name}")\` (see src/main/mcpSdk.ts), or, if the window really needs it, add it to eagerPackages in perf-budgets.json.`);
}
for (const [name, value] of Object.entries(measured)) {
	const limit = budgets.bytes?.[name];
	if (typeof limit !== "number") continue;
	const ok = value <= limit;
	rows.push([name, `${kb(value)} of ${kb(limit)}`, ok]);
	if (!ok) failures.push(`${name} is ${kb(value)}, over its ${kb(limit)} budget by ${kb(value - limit)}. Find what grew (pnpm --filter @phaseo/desktop perf --only=bundle), or raise the budget with the reason in the pull request.`);
}
const boot = readFileSync(path.join(dist, "main", "boot.mjs"), "utf8");
const checks = [
	["Compile cache switched on in boot.mjs", /enableCompileCache/.test(boot), "boot.mjs no longer calls module.enableCompileCache, so every launch compiles the main bundle again (src/main/boot.ts)."],
	["Logo shown while the window loads", /id="phaseo-splash"/.test(renderer.html), "index.html lost the loading logo (#phaseo-splash), so the window is blank until the app's code runs."],
	["No blocking script before the app", ![...renderer.html.matchAll(/<script\b(?![^>]*type="module")[^>]*>/g)].length, "index.html has a classic <script>, which blocks the first paint; load code as a module."],
];
for (const [name, ok, message] of checks) { rows.push([name, ok ? "yes" : "no", ok]); if (!ok) failures.push(message); }

const table = ["| Check | Result | |", "| --- | --- | --- |", ...rows.map(([name, value, ok]) => `| ${name} | ${value} | ${ok ? "✅" : "❌"} |`)].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Desktop startup budgets\n\n${table}\n\n${failures.length ? failures.map(text => `- ${text}`).join("\n") : "All within budget."}\n`, { flag: "a" });
if (failures.length) { console.error(`\n${failures.length} startup budget ${failures.length === 1 ? "check" : "checks"} failed:\n${failures.map(text => `- ${text}`).join("\n")}`); process.exit(1); }
console.log("\nAll startup budgets met.");
