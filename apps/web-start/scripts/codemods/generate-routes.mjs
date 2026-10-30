// Generate TanStack Start file routes from the Next.js app tree in src/app.
// Pages and layouts stay where they are and are imported by thin route files;
// route handlers become server routes. Existing route files are left alone
// (hand-ported routes win), so the script can be re-run safely.
// usage: node generate-routes.mjs [--force]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const appDir = path.join(root, "src/app");
const routesDir = path.join(root, "src/routes");
const force = process.argv.includes("--force");

// Hand-written routes that replace Next files.
const SKIP = new Set(["[locale]/layout.tsx", "[locale]/(dashboard)/layout.tsx", "[locale]/not-found.tsx", "[locale]/error.tsx", "global-error.tsx", "global-not-found.tsx"]);

function walk(dir, out = []) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

/** Next segment → TanStack file-route segment and route-id segment. */
function mapSegment(segment) {
	if (segment === "[locale]") return { file: "{-$locale}", id: "{-$locale}" };
	let m = segment.match(/^\(([\w-]+)\)$/);
	if (m) return { file: `_${m[1]}`, id: `_${m[1]}` };
	m = segment.match(/^\[\[?\.\.\.([\w-]+)\]\]?$/);
	if (m) return { file: "$", id: "$", splat: m[1] };
	m = segment.match(/^\[([\w-]+)\]$/);
	if (m) return { file: `$${m[1]}`, id: `$${m[1]}` };
	if (segment.includes(".") || segment.startsWith("_")) return { file: `[${segment}]`, id: segment };
	return { file: segment, id: segment };
}

function mapDir(relDir) {
	const segments = relDir ? relDir.split("/") : [];
	const mapped = segments.map(mapSegment);
	return {
		fileDir: mapped.map((s) => s.file).join("/"),
		id: "/" + mapped.map((s) => s.id).join("/"),
		splat: mapped.find((s) => s.splat)?.splat,
		localized: segments[0] === "[locale]",
	};
}

const files = walk(appDir).map((f) => path.relative(appDir, f).replace(/\\/g, "/"));
const byDir = new Map();
for (const rel of files) {
	const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
	const base = path.posix.basename(rel);
	if (!byDir.has(dir)) byDir.set(dir, new Set());
	byDir.get(dir).add(base);
}

const importPath = (rel) => "@/app/" + rel.replace(/\.(tsx?|jsx?)$/, "");
const has = (dir, name) => byDir.get(dir)?.has(`${name}.tsx`) || byDir.get(dir)?.has(`${name}.ts`);
const exportsOf = (rel) => fs.readFileSync(path.join(appDir, rel), "utf8");

let written = 0, skipped = 0;
const report = [];

function write(file, contents) {
	const abs = path.join(routesDir, file);
	if (fs.existsSync(abs) && !force) { skipped++; return; }
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, contents);
	written++;
}

function metadataParts(rel, splat) {
	const code = exportsOf(rel);
	const dynamic = /export\s+(async\s+)?function\s+generateMetadata|export\s+const\s+generateMetadata/.test(code);
	const staticMeta = /export\s+const\s+metadata\b/.test(code);
	if (dynamic) {
		return {
			imports: [`import { createServerFn } from "@tanstack/react-start";`, `import { metadataInput, runGenerateMetadata, type MetadataInput } from "@/lib/start/nextPage";`, `import { metadataToHead } from "@/lib/start/metadataToHead";`],
			decl: `const routeMetadata = createServerFn({ method: "GET" })\n\t.validator((input: MetadataInput) => input)\n\t.handler(({ data }) => runGenerateMetadata((mod as { generateMetadata?: Parameters<typeof runGenerateMetadata>[0] }).generateMetadata, metadataInput(data)));\n`,
			options: `\tloader: async ({ params, location }) => ({ metadata: await routeMetadata({ data: { params, search: location.search as Record<string, unknown>${splat ? `, splatName: ${JSON.stringify(splat)}` : ""} } }) }),\n\thead: ({ loaderData }) => metadataToHead(loaderData?.metadata),\n`,
		};
	}
	if (staticMeta) {
		return { imports: [`import { metadataToHead } from "@/lib/start/metadataToHead";`], decl: "", options: `\thead: () => metadataToHead((mod as { metadata?: Record<string, unknown> }).metadata),\n` };
	}
	return { imports: [], decl: "", options: "" };
}

for (const [dir, names] of byDir) {
	const { fileDir, id, splat, localized } = mapDir(dir);
	const splatOpt = splat ? `, { splatName: ${JSON.stringify(splat)} }` : "";
	const hasLayout = has(dir, "layout") || has(dir, "template");
	const extraOptions = [];
	const extraImports = [];
	if (has(dir, "not-found") && !SKIP.has(`${dir}/not-found.tsx`)) { extraImports.push(`import NotFound from "${importPath(`${dir}/not-found`)}";`); extraOptions.push(`\tnotFoundComponent: NotFound,\n`); }
	if (has(dir, "error") && !SKIP.has(`${dir}/error.tsx`)) { extraImports.push(`import ErrorView from "${importPath(`${dir}/error`)}";`); extraOptions.push(`\terrorComponent: ErrorView,\n`); }

	// Layout / template → layout route.
	for (const kind of ["layout", "template"]) {
		const rel = `${dir}/${kind}.tsx`.replace(/^\//, "");
		if (!names.has(`${kind}.tsx`) || SKIP.has(rel)) continue;
		if (kind === "template" && names.has("layout.tsx")) continue; // layout wins; template folds into it below
		const meta = metadataParts(rel, splat);
		const routeFile = `${fileDir}/route.tsx`;
		const routeId = id;
		write(routeFile, [
			`// Next: src/app/${rel}`,
			`import { createFileRoute } from "@tanstack/react-router";`,
			...meta.imports,
			`import { nextLayoutComponent } from "@/lib/start/nextPage";`,
			`import Layout, * as mod from "${importPath(rel)}";`,
			...extraImports,
			"",
			meta.decl,
			`export const Route = createFileRoute(${JSON.stringify(routeId)})({`,
			meta.options + extraOptions.join("") + `\tcomponent: nextLayoutComponent(Layout${splatOpt}),`,
			`});`,
			"",
		].filter((l) => l !== undefined).join("\n"));
		report.push(`layout ${routeId}`);
	}

	// Page → index route (or the route file itself when there is no layout).
	if (names.has("page.tsx")) {
		const rel = `${dir}/page.tsx`.replace(/^\//, "");
		const meta = metadataParts(rel, splat);
		const loading = has(dir, "loading");
		const routeFile = hasLayout || splat ? `${fileDir}/index.tsx` : `${fileDir}/index.tsx`;
		const routeId = splat ? id : `${id}/`;
		write(routeFile.replace(/^\//, ""), [
			`// Next: src/app/${rel}`,
			`import { createFileRoute } from "@tanstack/react-router";`,
			...meta.imports,
			`import { nextPageComponent${loading ? ", withLoading" : ""} } from "@/lib/start/nextPage";`,
			`import Page, * as mod from "${importPath(rel)}";`,
			...(loading ? [`import Loading from "${importPath(`${dir}/loading`)}";`] : []),
			...(hasLayout ? [] : extraImports),
			"",
			meta.decl,
			`export const Route = createFileRoute(${JSON.stringify(routeId.replace(/\/\/$/, "/"))})({`,
			meta.options + (hasLayout ? "" : extraOptions.join("")) + `\tcomponent: ${loading ? `withLoading(nextPageComponent(Page${splatOpt}), Loading)` : `nextPageComponent(Page${splatOpt})`},`,
			`});`,
			"",
		].join("\n"));
		report.push(`page ${routeId}`);
	}

	// Route handler → server route.
	for (const handlerName of ["route.ts", "route.tsx"]) {
		if (!names.has(handlerName)) continue;
		const rel = `${dir}/${handlerName}`.replace(/^\//, "");
		const routeFile = `${fileDir}/index.ts`.replace(/^\//, "");
		const routeId = splat ? id : `${id}/`;
		write(routeFile, [
			`// Next: src/app/${rel}`,
			`import { createFileRoute } from "@tanstack/react-router";`,
			`import { nextRouteHandlers } from "@/lib/start/nextRouteHandlers";`,
			`import * as handlers from "${importPath(rel)}";`,
			"",
			`export const Route = createFileRoute(${JSON.stringify(routeId)})({`,
			`\tserver: { handlers: nextRouteHandlers(handlers${splat || localized ? `, { ${[splat ? `splatName: ${JSON.stringify(splat)}` : "", localized ? "localized: true" : ""].filter(Boolean).join(", ")} }` : ""}) },`,
			`});`,
			"",
		].join("\n"));
		report.push(`handler ${routeId}`);
	}
}

console.log(JSON.stringify({ written, skipped, routes: report.length }));
if (process.env.LIST) console.log(report.sort().join("\n"));
