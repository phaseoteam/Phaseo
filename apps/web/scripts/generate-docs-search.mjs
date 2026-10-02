import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import yaml from "js-yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const docsRoot = path.join(root, "apps/docs");
const navigation = JSON.parse(readFileSync(path.join(docsRoot, "docs.json"), "utf8")).navigation;
const paths = new Set();

function collect(value) {
	if (typeof value === "string") {
		if (value.startsWith("v1/")) paths.add(value);
		return;
	}
	if (Array.isArray(value)) value.forEach(collect);
	else if (value && typeof value === "object") Object.values(value).forEach(collect);
}

collect(navigation);
const localeDirectories = {
	"en-GB": "",
	"es-ES": "es",
	"fr-FR": "fr",
	"de-DE": "de",
	"pt-BR": "pt-BR",
	ja: "ja",
	"zh-Hans": "zh-Hans",
	hi: "hi",
	"ar-SA": "ar",
};

function readPage(slug, directory) {
	const file = path.join(docsRoot, directory, `${slug}.mdx`);
	if (!existsSync(file)) return undefined;
	const source = readFileSync(file, "utf8");
	const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
	const metadata = frontmatter ? yaml.load(frontmatter[1], { schema: yaml.JSON_SCHEMA }) : undefined;
	if (typeof metadata?.title !== "string" || !metadata.title.trim()) {
		throw new Error(`Missing documentation search title: ${file}`);
	}
	const title = metadata.title;
	const description = typeof metadata.description === "string" ? metadata.description : null;
	const headings = [...source.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].replace(/[`*\[\]]/g, "")).slice(0, 20);
	return { id: `docs-${slug}`, title, subtitle: description, href: `https://phaseo.app/docs/${slug}`, external: true, keywords: [slug.replaceAll("/", " ").replaceAll("-", " "), ...headings] };
}

for (const [locale, directory] of Object.entries(localeDirectories)) {
	const pages = [...paths].map((slug) => readPage(slug, directory)).filter(Boolean);
	const filename = locale === "en-GB" ? "Search.docs.generated.json" : `Search.docs.${locale}.generated.json`;
	writeFileSync(path.join(root, "apps/web/src/components/header/Search", filename), `[\n${pages.map((page) => `  ${JSON.stringify(page)}`).join(",\n")}\n]\n`);
	console.log(`${locale}: indexed ${pages.length} documentation pages`);
}
