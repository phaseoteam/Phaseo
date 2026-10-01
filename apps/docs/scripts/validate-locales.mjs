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

const sourcePages = listPages(sourceRoot);
if (sourcePages.size === 0) {
	throw new Error(`No Markdown or MDX pages found in ${sourceRoot}`);
}

const issues = [];
for (const locale of locales) {
	const localeRoot = join(docsRoot, locale, "v1");
	const translatedPages = listPages(localeRoot);
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
	throw new Error(`Localized docs coverage failed:\n- ${issues.join("\n- ")}`);
}

process.stdout.write(
	`Localized docs coverage valid: ${sourcePages.size} pages across ${locales.length} locales\n`,
);
