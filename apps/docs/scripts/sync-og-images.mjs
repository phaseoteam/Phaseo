// Keeps an `og:image` line in every English docs page's frontmatter, pointing
// at the web app's /og/dynamic endpoint with the page's title, description and
// path. Mintlify has no per-page template for og:image, so the URL lives in
// each page.
//
//   node scripts/sync-og-images.mjs          rewrite pages that are out of date
//   node scripts/sync-og-images.mjs --check  fail if any page is out of date
//
// Translated pages keep Mintlify's generated card: the endpoint only renders
// Latin text. translation-freshness.mjs ignores this line, so syncing it does
// not mark translations stale.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const docsRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sourceRoot = join(docsRoot, "v1");
const OG_ENDPOINT = "https://phaseo.app/og/dynamic";
const OG_IMAGE_KEY = '"og:image"';

// Mirrors the limits and link rule in apps/web/src/lib/og/dynamicOg.ts. A
// value the endpoint would reject means a page with no share image at all.
const LIMITS = { title: 90, description: 180, pathname: 80 };
const DOMAIN_LIKE = /[\p{L}\p{N}-]\.[a-z]{2,63}(?![\p{L}\p{N}])/iu;
const ALLOWED_DOTTED_NAMES =
	/(?<![\p{L}\p{N}\-.])(?:(?:docs\.)?phaseo\.app|(?:next|node|nuxt|vue|react|three|d3|express|nest|svelte|solid|ember|chart|moment|p5|tensorflow)\.js|asp\.net|\.net)(?![\p{L}\p{N}\-]|\.[\p{L}\p{N}])/giu;

// Card text for pages whose own title or description reads as a link to the
// endpoint (for example "SKILL.md" or "crates.io").
const OVERRIDES = {
	"cookbook/coding-agents-skill-md.mdx": {
		title: "Set up coding agents with skill files",
		description:
			"Pair the SDK with a skill file so local coding agents can use your Phaseo integration consistently.",
	},
	"sdk-reference/rust/installation.mdx": {
		description: "Install the phaseo crate and configure Phaseo Gateway authentication.",
	},
};

function listPages(dir, pages = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) listPages(path, pages);
		else if (entry.name.endsWith(".mdx")) pages.push(path);
	}
	return pages;
}

function readScalar(frontmatter, key) {
	const match = frontmatter.match(new RegExp(`^${key}:[ \\t]*(.+)$`, "m"));
	if (!match) return undefined;
	const raw = match[1].trim();
	if (raw.startsWith('"')) return JSON.parse(raw);
	if (raw.startsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
	return raw;
}

function clean(value) {
	return value?.normalize("NFKC").replace(/\s+/g, " ").trim() || undefined;
}

function truncate(value, limit) {
	if (value.length <= limit) return value;
	const cut = value.slice(0, limit - 1);
	return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[\s,.;:—–-]+$/, "")}…`;
}

function looksLikeLink(value) {
	return DOMAIN_LIKE.test(value.replace(ALLOWED_DOTTED_NAMES, " "));
}

function buildImageUrl(page, frontmatter, problems) {
	const override = OVERRIDES[page] ?? {};
	const title = clean(override.title ?? readScalar(frontmatter, "title"));
	if (!title) {
		problems.push(`${page}: no title`);
		return undefined;
	}
	if (title.length > LIMITS.title || looksLikeLink(title)) {
		problems.push(`${page}: title "${title}" is too long or reads as a link; add an OVERRIDES entry`);
		return undefined;
	}
	let description = clean(override.description ?? readScalar(frontmatter, "description"));
	if (description) {
		description = truncate(description, LIMITS.description);
		if (looksLikeLink(description)) {
			problems.push(`${page}: description reads as a link; add an OVERRIDES entry`);
			return undefined;
		}
	}
	const pathname = `/docs/v1/${page.replace(/\.mdx$/, "")}`.replace(/\/index$/, "");
	if (pathname.length > LIMITS.pathname) {
		problems.push(`${page}: path is longer than ${LIMITS.pathname} characters`);
		return undefined;
	}

	const params = new URLSearchParams({ title });
	if (description) params.set("description", description);
	params.set("pathname", pathname);
	return `${OG_ENDPOINT}?${params.toString().replace(/\+/g, "%20").replace(/%2F/g, "/")}`;
}

function syncPage(contents, url) {
	const eol = contents.includes("\r\n") ? "\r\n" : "\n";
	const match = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!match) return undefined;
	const lines = match[1].split(/\r?\n/).filter((line) => !line.startsWith(`${OG_IMAGE_KEY}:`));
	const anchor = Math.max(
		lines.findIndex((line) => line.startsWith("description:")),
		lines.findIndex((line) => line.startsWith("title:")),
	);
	lines.splice(anchor + 1, 0, `${OG_IMAGE_KEY}: ${JSON.stringify(url)}`);
	return `---${eol}${lines.join(eol)}${eol}---${contents.slice(match[0].length)}`;
}

const check = process.argv.includes("--check");
const problems = [];
const stale = [];
const writes = [];
for (const file of listPages(sourceRoot)) {
	const page = relative(sourceRoot, file).split(sep).join("/");
	const contents = readFileSync(file, "utf8");
	const frontmatter = contents.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1];
	if (frontmatter === undefined) {
		problems.push(`${page}: no frontmatter`);
		continue;
	}
	const url = buildImageUrl(page, frontmatter, problems);
	if (!url) continue;
	const next = syncPage(contents, url);
	if (next === contents) continue;
	stale.push(page);
	writes.push([file, next]);
}

if (problems.length > 0) {
	console.error(`Docs OG images: ${problems.length} page(s) need attention:\n  ${problems.join("\n  ")}`);
	process.exit(1);
}
if (!check) for (const [file, next] of writes) writeFileSync(file, next);
if (check && stale.length > 0) {
	console.error(
		`Docs OG images are out of date on ${stale.length} page(s). Run 'pnpm --filter @phaseo/docs og:sync' and commit:\n  ${stale.slice(0, 20).join("\n  ")}`,
	);
	process.exit(1);
}
console.log(check ? "Docs OG images are up to date." : `Updated OG images on ${stale.length} page(s).`);
