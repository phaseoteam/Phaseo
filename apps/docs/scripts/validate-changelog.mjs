#!/usr/bin/env node
// Checks the changelog pages use the tagged <Update> format Mintlify's filters need:
// one category tag per update, one update per (date, tag), and locale pages that
// match the English page block for block.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TAGS = {
	en: ["Product", "API & SDKs", "Models"],
	es: ["Producto", "API y SDK", "Modelos"],
	fr: ["Produit", "API et SDK", "Modèles"],
	de: ["Produkt", "API & SDKs", "Modelle"],
	"pt-BR": ["Produto", "API e SDKs", "Modelos"],
	ja: ["製品", "API と SDK", "モデル"],
	"zh-Hans": ["产品", "API 与 SDK", "模型"],
	hi: ["उत्पाद", "API और SDK", "मॉडल"],
	ar: ["المنتج", "API وحزم SDK", "النماذج"],
};

const UPDATE_RE = /<Update\s+label="([^"]+)"\s+tags=\{\[([^\]]*)\]\}[^>]*>/g;

function pagesFor(locale) {
	const base = locale === "en" ? path.join(docsDir, "v1") : path.join(docsDir, locale, "v1");
	const dir = path.join(base, "changelog");
	return ["changelog.mdx", ...fs.readdirSync(dir).filter((f) => f.endsWith(".mdx")).sort().map((f) => `changelog/${f}`)].map(
		(page) => ({ page, file: path.join(base, page) }),
	);
}

function parse(file, locale, errors) {
	const text = fs.readFileSync(file, "utf8");
	const rel = path.relative(docsDir, file);
	const opens = (text.match(/<Update\b/g) ?? []).length;
	const closes = (text.match(/<\/Update>/g) ?? []).length;
	if (opens !== closes) errors.push(`${rel}: ${opens} <Update> but ${closes} </Update>`);
	if (/^#{2,3}\s/m.test(text)) errors.push(`${rel}: use <Update> blocks, not ## or ### headings`);
	const blocks = [];
	const seen = new Set();
	for (const match of text.matchAll(UPDATE_RE)) {
		const [, label, rawTags] = match;
		const tags = [...rawTags.matchAll(/"([^"]+)"/g)].map((t) => t[1]);
		const index = tags.length === 1 ? TAGS[locale].indexOf(tags[0]) : -1;
		if (index === -1) errors.push(`${rel}: "${label}" needs exactly one of ${TAGS[locale].join(", ")} (has ${rawTags || "none"})`);
		const key = `${label}|${tags[0]}`;
		if (seen.has(key)) errors.push(`${rel}: more than one "${tags[0]}" update on ${label}`);
		seen.add(key);
		blocks.push({ label, category: index });
	}
	if (blocks.length !== opens) errors.push(`${rel}: every <Update> needs a label and a tags list`);
	return blocks;
}

const errors = [];
const english = new Map(pagesFor("en").map(({ page, file }) => [page, parse(file, "en", errors)]));
for (const locale of Object.keys(TAGS).filter((l) => l !== "en")) {
	for (const { page, file } of pagesFor(locale)) {
		const blocks = parse(file, locale, errors);
		const source = english.get(page);
		if (!source) {
			errors.push(`${locale}/v1/${page}: no English page`);
			continue;
		}
		const shape = (list) => list.map((b) => b.category).join(",");
		if (shape(blocks) !== shape(source)) {
			errors.push(`${locale}/v1/${page}: updates do not match English (${blocks.length} vs ${source.length} blocks, or categories differ)`);
		}
	}
}

if (errors.length) {
	for (const error of errors) console.error(`- ${error}`);
	console.error(`Changelog format check failed with ${errors.length} problem(s). See .agents/skills/phaseo-changelog.`);
	process.exit(1);
}
const total = [...english.values()].reduce((n, b) => n + b.length, 0);
console.log(`Changelog format valid: ${english.size} pages, ${total} updates, 9 languages`);
