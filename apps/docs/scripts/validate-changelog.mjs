#!/usr/bin/env node
// Checks the changelog pages use the layout snippets/changelog-filters.jsx needs: one <Update> per date, holding a
// section per category (Product, API & SDKs, Models) in that order, the filter bar with the page language's labels,
// and locale pages that match the English page date for date and section for section.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const docsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const KEYS = ["product", "api", "models"];
const LABELS = {
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

const IMPORT = 'import { ChangelogFilters } from "/snippets/changelog-filters.jsx";';
const UPDATE_RE = /<Update\s+label="([^"]+)">\n([\s\S]*?)\n<\/Update>/g;
const SECTION_RE = /<div data-changelog-category="([^"]+)">\n\n<p className="changelog-category">([^<]*)<\/p>\n\n([\s\S]*?)\n\n<\/div>/g;

function pagesFor(locale) {
	const base = locale === "en" ? path.join(docsDir, "v1") : path.join(docsDir, locale, "v1");
	const dir = path.join(base, "changelog");
	return ["changelog.mdx", ...fs.readdirSync(dir).filter((f) => f.endsWith(".mdx")).sort().map((f) => `changelog/${f}`)].map(
		(page) => ({ page, file: path.join(base, page) }),
	);
}

function parse(file, locale, errors) {
	const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
	const rel = path.relative(docsDir, file);
	const fail = (message) => errors.push(`${rel}: ${message}`);
	const labels = LABELS[locale];

	if (!text.includes(IMPORT)) fail(`import the filter bar: ${IMPORT}`);
	const bars = [...text.matchAll(/<ChangelogFilters labels=\{(\{[^}]*\})\}[^>]*\/>/g)];
	if (bars.length !== 1) fail(`needs exactly one <ChangelogFilters /> (has ${bars.length})`);
	else {
		const expected = JSON.stringify(Object.fromEntries(KEYS.map((key, i) => [key, labels[i]])));
		if (bars[0][1] !== expected) fail(`<ChangelogFilters labels> should be ${expected}`);
	}
	if (/^#{2,3}\s/m.test(text)) fail("use <Update> blocks with category sections, not ## or ### headings");
	if (/<Update\b[^>]*\btags=/.test(text)) fail("updates take no tags; categories are sections inside the update");

	const opens = (text.match(/<Update\b/g) ?? []).length;
	const dates = [];
	const seen = new Set();
	for (const [, label, body] of text.matchAll(UPDATE_RE)) {
		if (seen.has(label)) fail(`more than one <Update> for ${label}; merge them`);
		seen.add(label);
		const sections = [...body.matchAll(SECTION_RE)];
		const leftover = body.replace(SECTION_RE, "").trim();
		if (leftover) fail(`${label}: everything inside an update belongs in a category section`);
		if (sections.length === 0) fail(`${label}: has no category sections`);
		const order = [];
		for (const [, key, heading, content] of sections) {
			const index = KEYS.indexOf(key);
			if (index === -1) {
				fail(`${label}: unknown category "${key}" (use ${KEYS.join(", ")})`);
				continue;
			}
			if (heading !== labels[index]) fail(`${label}: the ${key} section is labelled "${heading}", expected "${labels[index]}"`);
			if (!content.trim()) fail(`${label}: the ${key} section is empty`);
			order.push(index);
		}
		if (order.some((index, i) => i > 0 && index <= order[i - 1])) fail(`${label}: sections must be Product, API & SDKs, Models, each at most once`);
		dates.push({ label, shape: order.join("") });
	}
	if (dates.length !== opens) fail("every <Update> needs only a label, and must close with </Update> on its own line");
	if (locale === "en") {
		let previous = Infinity;
		for (const date of dates) {
			const time = Date.parse(date.label);
			if (Number.isNaN(time)) fail(`"${date.label}" is not a date like "October 24, 2026"`);
			else if (time >= previous) fail(`${date.label}: dates must run newest first`);
			else previous = time;
		}
	}
	return dates;
}

const errors = [];
const english = new Map(pagesFor("en").map(({ page, file }) => [page, parse(file, "en", errors)]));
for (const locale of Object.keys(LABELS).filter((l) => l !== "en")) {
	for (const { page, file } of pagesFor(locale)) {
		const dates = parse(file, locale, errors);
		const source = english.get(page);
		if (!source) {
			errors.push(`${locale}/v1/${page}: no English page`);
			continue;
		}
		if (dates.map((d) => d.shape).join(",") !== source.map((d) => d.shape).join(",")) {
			errors.push(`${locale}/v1/${page}: dates or sections do not match English (${dates.length} vs ${source.length} dates)`);
			continue;
		}
		// Every language writes dates with Western digits, so each label must carry the English date's day and year.
		source.forEach((english, i) => {
			const date = new Date(english.label);
			const numbers = dates[i].label.match(/\d+/g)?.map(Number) ?? [];
			if (!numbers.includes(date.getDate()) || !numbers.includes(date.getFullYear())) {
				errors.push(`${locale}/v1/${page}: "${dates[i].label}" should be the same date as "${english.label}"`);
			}
		});
	}
}

if (errors.length) {
	for (const error of errors) console.error(`- ${error}`);
	console.error(`Changelog format check failed with ${errors.length} problem(s). See .agents/skills/phaseo-changelog.`);
	process.exit(1);
}
const dates = [...english.values()].reduce((n, page) => n + page.length, 0);
const sections = [...english.values()].reduce((n, page) => n + page.reduce((m, date) => m + date.shape.length, 0), 0);
console.log(`Changelog format valid: ${english.size} pages, ${dates} dates, ${sections} sections, 9 languages`);
