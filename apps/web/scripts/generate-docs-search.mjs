import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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
const pages = [...paths].filter((slug) => existsSync(path.join(docsRoot, `${slug}.mdx`))).map((slug) => {
	const source = readFileSync(path.join(docsRoot, `${slug}.mdx`), "utf8");
	const frontmatter = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
	const field = (name) => frontmatter?.[1].match(new RegExp(`^${name}:\\s*["']?(.*?)["']?\\s*$`, "m"))?.[1] ?? "";
	const title = field("title") || slug.split("/").at(-1).replaceAll("-", " ");
	const description = field("description");
	const headings = [...source.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].replace(/[`*\[\]]/g, "")).slice(0, 20);
	return { id: `docs-${slug}`, title, subtitle: description || "Phaseo documentation", href: `https://phaseo.app/docs/${slug}`, external: true, keywords: [slug.replaceAll("/", " ").replaceAll("-", " "), ...headings] };
});

writeFileSync(path.join(root, "apps/web/src/components/header/Search/Search.docs.generated.json"), `[\n${pages.map((page) => `  ${JSON.stringify(page)}`).join(",\n")}\n]\n`);
console.log(`Indexed ${pages.length} documentation pages`);
