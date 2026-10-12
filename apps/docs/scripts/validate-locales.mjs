import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(docsRoot, "v1");
const locales = ["ar", "de", "es", "fr", "hi", "ja", "pt-BR", "zh-Hans"];
const pageExtensions = new Set([".md", ".mdx"]);
const docsConfig = JSON.parse(readFileSync(join(docsRoot, "docs.json"), "utf8"));
const redirects = new Map(
	(docsConfig.redirects ?? []).map(({ source, destination }) => [source, destination]),
);

function hasLocalizedRedirect(page, locale) {
	const route = `/v1/${page.replace(/\.(md|mdx)$/, "")}`;
	const destination = redirects.get(route);
	if (typeof destination !== "string") return false;
	const localizedDestination = destination.startsWith("/v1/")
		? `/${locale}${destination}`
		: destination;
	return redirects.get(`/${locale}${route}`) === localizedDestination;
}

function listPages(root, parent = root, pages = new Set()) {
	for (const entry of readdirSync(parent, { withFileTypes: true })) {
		const path = join(parent, entry.name);
		if (entry.isDirectory()) {
			listPages(root, path, pages);
		} else if (pageExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
			pages.add(relative(root, path).split(sep).join("/"));
		}
	}
	return pages;
}

// Mintlify resolves an `openapi: "METHOD /path"` reference against the alphabetically first spec
// that defines the operation, which is a localized spec. Every page must name its own spec file.
function openApiReferenceIssue(path, specFile) {
	const frontmatter = readFileSync(path, "utf8").match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
	const reference = frontmatter?.[1].match(/^openapi:\s*["']?(.*?)["']?\s*$/m)?.[1];
	if (reference === undefined || reference.startsWith(`${specFile} `)) return undefined;
	return `${relative(docsRoot, path).split(sep).join("/")} must reference "${specFile} METHOD /path", found "${reference}"`;
}

// An unclosed code fence renders the rest of the page as code.
function unclosedFenceIssue(path) {
	let fence;
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
		if (!marker) continue;
		if (!fence) fence = marker[1];
		else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
	}
	return fence ? `${relative(docsRoot, path).split(sep).join("/")} has an unclosed code fence` : undefined;
}

const sourcePages = listPages(sourceRoot);
if (sourcePages.size === 0) {
	throw new Error(`No Markdown or MDX pages found in ${sourceRoot}`);
}

const issues = [];
for (const page of sourcePages) {
	const path = join(sourceRoot, page);
	for (const issue of [openApiReferenceIssue(path, "/openapi/v1/openapi.yaml"), unclosedFenceIssue(path)]) {
		if (issue) issues.push(issue);
	}
}
for (const locale of locales) {
	const localeRoot = join(docsRoot, locale, "v1");
	const translatedPages = listPages(localeRoot);
	for (const page of translatedPages) {
		const path = join(localeRoot, page);
		const specFile = `/${locale}/openapi/v1/openapi.localized.yaml`;
		for (const issue of [openApiReferenceIssue(path, specFile), unclosedFenceIssue(path)]) {
			if (issue) issues.push(issue);
		}
	}
	const missing = [...sourcePages].filter((page) => !translatedPages.has(page));
	const unexpected = [...translatedPages].filter(
		(page) => !sourcePages.has(page) && !hasLocalizedRedirect(page, locale),
	);
	if (missing.length > 0 || unexpected.length > 0) {
		issues.push(
			`${locale}: ${missing.length} missing page(s), ${unexpected.length} unexpected page(s)` +
				(missing.length > 0 ? `; missing: ${missing.slice(0, 5).join(", ")}` : "") +
				(unexpected.length > 0
					? `; unexpected: ${unexpected.slice(0, 5).join(", ")}`
					: ""),
		);
	}
}

if (issues.length > 0) {
	throw new Error(`Localized docs validation failed:\n- ${issues.join("\n- ")}`);
}

process.stdout.write(
	`Localized docs coverage, OpenAPI references and code fences valid: ${sourcePages.size} pages across ${locales.length} locales\n`,
);
