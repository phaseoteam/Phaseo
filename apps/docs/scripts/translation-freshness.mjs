import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(docsRoot));
const sourceRoot = join(docsRoot, "v1");
const docsConfigPath = join(docsRoot, "docs.json");
const openApiCopyPath = join(docsRoot, "openapi/localized-copy.json");
const manifestPath = join(docsRoot, "translation-status.json");
const locales = ["ar", "de", "es", "fr", "hi", "ja", "pt-BR", "zh-Hans"];
const pageExtensions = new Set([".md", ".mdx"]);
const hash = (contents) => {
	const normalized = Buffer.isBuffer(contents)
		? contents.toString("utf8").replace(/\r\n/g, "\n")
		: contents.replace(/\r\n/g, "\n");
	return createHash("sha256").update(normalized).digest("hex");
};

function listPages(root, parent = root, pages = new Set()) {
	if (!existsSync(root)) return pages;
	for (const entry of readdirSync(parent, { withFileTypes: true })) {
		const path = join(parent, entry.name);
		if (entry.isDirectory()) {
			listPages(root, path, pages);
		} else if (pageExtensions.has(extname(entry.name))) {
			pages.add(relative(root, path).split(sep).join("/"));
		}
	}
	return pages;
}

function readManifest() {
	if (!existsSync(manifestPath)) {
		throw new Error(
			`Missing ${relative(repoRoot, manifestPath)}. Run the one-time baseline command described in TRANSLATION_WORKFLOW.md.`,
		);
	}
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
	if (manifest.version !== 1 || !manifest.locales) {
		throw new Error(`Unsupported translation status manifest: ${manifestPath}`);
	}
	return manifest;
}

function sourceHashesFromWorkingTree() {
	const pages = listPages(sourceRoot);
	const hashes = new Map(
		[...pages].map((page) => [page, hash(readFileSync(join(sourceRoot, page)))]),
	);
	const openApiSourcePath = [
		join(docsRoot, "openapi/v1/openapi.public.yaml"),
		join(docsRoot, "openapi/v1/openapi.yaml"),
	].find(existsSync);
	if (openApiSourcePath) hashes.set("@openapi", hash(readFileSync(openApiSourcePath)));
	return hashes;
}

function sourceHashesFromRef(ref) {
	const tree = execFileSync(
		"git",
		[
			"ls-tree",
			"-r",
			"-z",
			ref,
			"--",
			"apps/docs/v1",
			"apps/docs/openapi/v1/openapi.public.yaml",
			"apps/docs/openapi/v1/openapi.yaml",
		],
		{ cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 },
	);
	const entries = tree
		.toString("utf8")
		.split("\0")
		.filter(Boolean)
		.map((entry) => {
			const separator = entry.indexOf("\t");
			const [mode, type, oid] = entry.slice(0, separator).split(" ");
			const path = entry.slice(separator + 1);
			return { mode, type, oid, path };
		})
		.filter(({ mode, type, path }) => {
			if (type !== "blob" || mode === "120000") return false;
			if (path.startsWith("apps/docs/v1/")) return pageExtensions.has(extname(path));
			return [
				"apps/docs/openapi/v1/openapi.public.yaml",
				"apps/docs/openapi/v1/openapi.yaml",
			].includes(path);
		});
	const openApiEntry =
		entries.find(({ path }) => path === "apps/docs/openapi/v1/openapi.public.yaml") ??
		entries.find(({ path }) => path === "apps/docs/openapi/v1/openapi.yaml");
	const selectedEntries = entries.filter(
		({ path }) =>
			!path.startsWith("apps/docs/openapi/v1/") ||
			path === openApiEntry?.path,
	);

	const blobContents = execFileSync(
		"git",
		["cat-file", "--batch"],
		{
			cwd: repoRoot,
			input: `${selectedEntries.map(({ oid }) => oid).join("\n")}\n`,
			maxBuffer: 128 * 1024 * 1024,
		},
	);
	const hashes = new Map();
	let offset = 0;
	for (const entry of selectedEntries) {
		const headerEnd = blobContents.indexOf(0x0a, offset);
		if (headerEnd < 0) throw new Error(`Could not read blob header for ${entry.path}`);
		const header = blobContents.toString("utf8", offset, headerEnd).split(" ");
		const size = Number(header[2]);
		const contentStart = headerEnd + 1;
		const contentEnd = contentStart + size;
		if (!Number.isInteger(size) || contentEnd >= blobContents.length) {
			throw new Error(`Could not read source content for ${entry.path}`);
		}
		const path = entry.path.startsWith("apps/docs/v1/")
			? entry.path.slice("apps/docs/v1/".length)
			: "@openapi";
		hashes.set(path, hash(blobContents.subarray(contentStart, contentEnd)));
		offset = contentEnd + 1;
	}
	return hashes;
}

function parseOptions(args) {
	const options = {};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--source-ref") options.sourceRef = args[++index];
		else if (argument === "--locale") options.locale = args[++index];
		else if (argument === "--page") options.page = args[++index];
		else if (argument === "--unit") options.unit = args[++index];
		else throw new Error(`Unknown option: ${argument}`);
	}
	if (Object.values(options).some((value) => !value)) {
		throw new Error("Every option requires a value.");
	}
	return options;
}

function getSourceHashes(sourceRef) {
	const sourceHashes = sourceRef
		? sourceHashesFromRef(sourceRef)
		: sourceHashesFromWorkingTree();
	if (sourceHashes.size === 0) {
		throw new Error(`No Markdown or MDX source pages found in ${sourceRef ?? sourceRoot}`);
	}
	return sourceHashes;
}

function hasLocaleTranslation(value, locale) {
	if (Array.isArray(value)) return value.some((child) => hasLocaleTranslation(child, locale));
	if (!value || typeof value !== "object") return false;
	if (typeof value[locale] === "string" && value[locale].trim()) return true;
	return Object.values(value).some((child) => hasLocaleTranslation(child, locale));
}

function readOpenApiCopy() {
	if (!existsSync(openApiCopyPath)) {
		throw new Error(`Missing localized OpenAPI copy: ${relative(repoRoot, openApiCopyPath)}`);
	}
	return JSON.parse(readFileSync(openApiCopyPath, "utf8"));
}

function getRedirectedSourcePaths(sourceRef) {
	const source = sourceRef
		? execFileSync("git", ["show", `${sourceRef}:apps/docs/docs.json`], {
				cwd: repoRoot,
					encoding: "utf8",
				})
		: readFileSync(docsConfigPath, "utf8");
	const docsConfig = JSON.parse(source);
	return new Set(
		(docsConfig.redirects ?? [])
			.map((redirect) => redirect.source)
			.filter((sourcePath) => typeof sourcePath === "string"),
	);
}

function getDocsRoute(page) {
	return `/v1/${page.replace(/\.(md|mdx)$/, "")}`;
}

function sortManifest(manifest) {
	const sortedLocales = {};
	for (const locale of locales) {
		const entries = manifest.locales[locale] ?? {};
		sortedLocales[locale] = Object.fromEntries(
			Object.entries(entries).sort(([left], [right]) =>
				left < right ? -1 : left > right ? 1 : 0,
			),
		);
	}
	return { version: 1, locales: sortedLocales };
}

function initialize() {
	if (existsSync(manifestPath)) {
		throw new Error(`Refusing to replace existing ${relative(repoRoot, manifestPath)}.`);
	}
	const sourceHashes = getSourceHashes();
	const manifest = { version: 1, locales: Object.fromEntries(locales.map((locale) => [locale, {}])) };
	const openApiCopy = sourceHashes.has("@openapi") ? readOpenApiCopy() : undefined;
	for (const locale of locales) {
		for (const page of listPages(join(docsRoot, locale, "v1"))) {
			const sourceHash = sourceHashes.get(page);
			if (sourceHash) manifest.locales[locale][page] = sourceHash;
		}
		if (sourceHashes.has("@openapi") && hasLocaleTranslation(openApiCopy, locale)) {
			manifest.locales[locale]["@openapi"] = sourceHashes.get("@openapi");
		}
	}
	writeFileSync(manifestPath, `${JSON.stringify(sortManifest(manifest), null, 2)}\n`);
	const count = Object.values(manifest.locales).reduce(
		(total, pages) => total + Object.keys(pages).filter((page) => page !== "@openapi").length,
		0,
	);
	process.stdout.write(
		`Created initial source-hash baseline for ${count} existing locale pages and ${sourceHashes.has("@openapi") ? locales.length : 0} localized OpenAPI entries. This records source alignment only; it does not certify translation quality.\n`,
	);
}

function record(args) {
	const options = parseOptions(args);
	if (!options.locale || !locales.includes(options.locale)) {
		throw new Error(`Choose --locale from: ${locales.join(", ")}`);
	}
	const sourceHashes = getSourceHashes(options.sourceRef);
	let key;
	let label;
	if (options.unit === "openapi") {
		if (options.page) throw new Error("Use either --unit openapi or --page, not both.");
		if (!sourceHashes.has("@openapi")) throw new Error("OpenAPI source file not found.");
		if (!hasLocaleTranslation(readOpenApiCopy(), options.locale)) {
			throw new Error(`No localized OpenAPI copy found for ${options.locale}.`);
		}
		key = "@openapi";
		label = `${options.locale} OpenAPI copy`;
	} else {
		if (options.unit) throw new Error(`Unknown unit: ${options.unit}`);
		if (!options.page) throw new Error("Provide --page <path-under-v1> or --unit openapi.");
		const page = options.page.replaceAll("\\", "/").replace(/^\/+/, "");
		if (page.split("/").includes("..") || !pageExtensions.has(extname(page))) {
			throw new Error(`Invalid page path: ${options.page}`);
		}
		if (!sourceHashes.has(page)) throw new Error(`English source page not found: ${page}`);
		if (!existsSync(join(docsRoot, options.locale, "v1", page))) {
			throw new Error(`Translated page not found: ${options.locale}/v1/${page}`);
		}
		key = page;
		label = `${options.locale}/v1/${page}`;
	}
	const manifest = readManifest();
	manifest.locales[options.locale] ??= {};
	manifest.locales[options.locale][key] = sourceHashes.get(key);
	writeFileSync(manifestPath, `${JSON.stringify(sortManifest(manifest), null, 2)}\n`);
	process.stdout.write(`Recorded ${label} against ${options.sourceRef ?? "the working tree"}.\n`);
}

function check(args) {
	const options = parseOptions(args);
	const sourceHashes = getSourceHashes(options.sourceRef);
	const redirectedSourcePaths = getRedirectedSourcePaths(options.sourceRef);
	const manifest = readManifest();
	const issues = [];
	const pageHashes = [...sourceHashes.keys()].filter((page) => page !== "@openapi");
	const openApiCopy = sourceHashes.has("@openapi") ? readOpenApiCopy() : undefined;
	process.stdout.write(
		`Checking ${pageHashes.length} English pages${sourceHashes.has("@openapi") ? " and the localized OpenAPI source" : ""} across ${locales.length} locales against ${options.sourceRef ?? "the working tree"}.\n`,
	);

	for (const locale of locales) {
		const translationRoot = join(docsRoot, locale, "v1");
		const translatedPages = listPages(translationRoot);
		const recordedPages = manifest.locales[locale] ?? {};
		const missing = pageHashes.filter((page) => !translatedPages.has(page));
		const retired = [...translatedPages].filter(
			(page) => !sourceHashes.has(page) && redirectedSourcePaths.has(getDocsRoute(page)),
		);
		const orphaned = [...translatedPages].filter(
			(page) => !sourceHashes.has(page) && !redirectedSourcePaths.has(getDocsRoute(page)),
		);
		const unrecorded = [...translatedPages].filter(
			(page) => sourceHashes.has(page) && !recordedPages[page],
		);
		const stale = [...translatedPages].filter(
			(page) =>
				sourceHashes.has(page) &&
				recordedPages[page] &&
				recordedPages[page] !== sourceHashes.get(page),
		);
		const hasOpenApiCopyForLocale = sourceHashes.has("@openapi") && hasLocaleTranslation(openApiCopy, locale);
		const openApiMissing = sourceHashes.has("@openapi") && !hasOpenApiCopyForLocale;
		const openApiUnrecorded = hasOpenApiCopyForLocale && !recordedPages["@openapi"];
		const openApiStale =
			hasOpenApiCopyForLocale &&
			recordedPages["@openapi"] &&
			recordedPages["@openapi"] !== sourceHashes.get("@openapi");
		if (
			missing.length || orphaned.length || unrecorded.length || stale.length ||
			openApiMissing || openApiUnrecorded || openApiStale
		) {
			issues.push({ locale, missing, orphaned, unrecorded, stale, openApiMissing, openApiUnrecorded, openApiStale });
		}
		process.stdout.write(
			`${locale}: ${missing.length} missing, ${stale.length} stale, ${unrecorded.length} unrecorded, ${orphaned.length} orphaned, ${retired.length} redirected; OpenAPI ${openApiMissing ? "missing" : openApiUnrecorded ? "unrecorded" : openApiStale ? "stale" : hasOpenApiCopyForLocale ? "current" : "not configured"}\n`,
		);
		for (const [label, pages] of [
			["missing", missing],
			["stale", stale],
			["unrecorded", unrecorded],
			["orphaned", orphaned],
			["redirected", retired],
		]) {
			for (const page of pages.slice(0, 5)) process.stdout.write(`  ${label}: ${page}\n`);
			if (pages.length > 5) process.stdout.write(`  ${label}: … and ${pages.length - 5} more\n`);
		}
		if (openApiMissing || openApiUnrecorded || openApiStale) {
			process.stdout.write(
				`  OpenAPI: ${openApiMissing ? "missing localized copy" : openApiUnrecorded ? "no recorded source version" : "source changed since review"}\n`,
			);
		}
	}

	if (issues.length) {
		process.stderr.write(
			`Translation freshness failed for ${issues.length} locale(s). Translate or review affected pages, add or retire locale files, then record reviewed source hashes with translation:freshness:record.\n`,
		);
		process.exitCode = 1;
	} else {
		process.stdout.write("Translation pages match the recorded English source versions.\n");
	}
}

const [command, ...args] = process.argv.slice(2);
try {
	if (command === "init") initialize();
	else if (command === "record") record(args);
	else if (command === "check") check(args);
	else throw new Error("Usage: translation-freshness.mjs <init|check|record> [options]");
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 1;
}
