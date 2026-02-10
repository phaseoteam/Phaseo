import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import { cache } from "react";

const CATEGORY_FILE_NAME = "_category.md";
const MARKDOWN_EXTENSION = ".md";
const DEFAULT_ORDER = Number.MAX_SAFE_INTEGER;
const FALLBACK_CATEGORY_PARAM = "__placeholder__";
const FALLBACK_ARTICLE_PARAM = "__placeholder__";

type MarkdownFrontmatter = {
	title?: unknown;
	description?: unknown;
	order?: unknown;
	updated?: unknown;
};

export type HelpArticleSummary = {
	categorySlug: string;
	categoryTitle: string;
	slug: string;
	title: string;
	description: string;
	order: number;
	updated: string | null;
};

export type HelpArticle = HelpArticleSummary & {
	content: string;
};

export type HelpCategory = {
	slug: string;
	title: string;
	description: string;
	order: number;
	articles: HelpArticleSummary[];
};

type HelpCenterData = {
	categories: HelpCategory[];
	articleLookup: Map<string, HelpArticle>;
};

function toTitleCaseFromSlug(slug: string): string {
	return slug
		.split("-")
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

function toStringValue(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: fallback;
}

function toOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function toOrder(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return DEFAULT_ORDER;
}

function createExcerpt(markdown: string): string {
	const cleaned = markdown
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/^\s*[-*+]\s+/gm, "")
		.replace(/\r?\n+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!cleaned) {
		return "No description provided yet.";
	}

	return cleaned.length > 180 ? `${cleaned.slice(0, 177)}...` : cleaned;
}

function parseMarkdownDocument(raw: string): {
	frontmatter: MarkdownFrontmatter;
	content: string;
} {
	const normalized = raw.replace(/^\uFEFF/, "");
	const match = normalized.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);

	if (!match) {
		return {
			frontmatter: {},
			content: normalized.trim(),
		};
	}

	const parsed = yamlLoad(match[1]);
	const frontmatter =
		parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as MarkdownFrontmatter)
			: {};
	const content = normalized.slice(match[0].length).trim();

	return { frontmatter, content };
}

async function resolveHelpContentRoot(): Promise<string | null> {
	const candidates = [
		path.join(process.cwd(), "src", "content", "help"),
		path.join(process.cwd(), "apps", "web", "src", "content", "help"),
	];

	for (const candidate of candidates) {
		try {
			const stat = await fs.stat(candidate);
			if (stat.isDirectory()) {
				return candidate;
			}
		} catch {
			// Try the next candidate.
		}
	}
	return null;
}

const loadHelpCenter = cache(async (): Promise<HelpCenterData> => {
	const helpRoot = await resolveHelpContentRoot();
	if (!helpRoot) {
		return {
			categories: [],
			articleLookup: new Map<string, HelpArticle>(),
		};
	}
	const entries = await fs.readdir(helpRoot, { withFileTypes: true });
	const categoryDirectories = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	const categories = await Promise.all(
		categoryDirectories.map(async (categorySlug): Promise<HelpCategory> => {
			const categoryPath = path.join(helpRoot, categorySlug);
			const files = await fs.readdir(categoryPath, { withFileTypes: true });
			const markdownFileNames = files
				.filter((file) => file.isFile() && file.name.endsWith(MARKDOWN_EXTENSION))
				.map((file) => file.name);

			const defaultCategoryTitle = toTitleCaseFromSlug(categorySlug);
			let categoryTitle = defaultCategoryTitle;
			let categoryDescription = `Articles about ${defaultCategoryTitle.toLowerCase()}.`;
			let categoryOrder = DEFAULT_ORDER;

			if (markdownFileNames.includes(CATEGORY_FILE_NAME)) {
				const categoryRaw = await fs.readFile(
					path.join(categoryPath, CATEGORY_FILE_NAME),
					"utf8"
				);
				const { frontmatter, content } = parseMarkdownDocument(categoryRaw);
				categoryTitle = toStringValue(frontmatter.title, defaultCategoryTitle);
				categoryDescription = toStringValue(
					frontmatter.description,
					content ? createExcerpt(content) : categoryDescription
				);
				categoryOrder = toOrder(frontmatter.order);
			}

			const articleFileNames = markdownFileNames.filter(
				(fileName) => fileName !== CATEGORY_FILE_NAME
			);

			const articles = await Promise.all(
				articleFileNames.map(async (fileName): Promise<HelpArticleSummary> => {
					const articleSlug = fileName.slice(0, -MARKDOWN_EXTENSION.length);
					const articleRaw = await fs.readFile(
						path.join(categoryPath, fileName),
						"utf8"
					);
					const { frontmatter, content } = parseMarkdownDocument(articleRaw);

					const title = toStringValue(
						frontmatter.title,
						toTitleCaseFromSlug(articleSlug)
					);
					const description = toStringValue(
						frontmatter.description,
						createExcerpt(content)
					);
					const order = toOrder(frontmatter.order);
					const updated = toOptionalString(frontmatter.updated);

					return {
						categorySlug,
						categoryTitle,
						slug: articleSlug,
						title,
						description,
						order,
						updated,
					};
				})
			);

			articles.sort(
				(a, b) =>
					a.order - b.order ||
					a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
			);

			return {
				slug: categorySlug,
				title: categoryTitle,
				description: categoryDescription,
				order: categoryOrder,
				articles,
			};
		})
	);

	categories.sort(
		(a, b) =>
			a.order - b.order ||
			a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
	);

	const articleLookup = new Map<string, HelpArticle>();
	await Promise.all(
		categories.map(async (category) => {
			await Promise.all(
				category.articles.map(async (summary) => {
					const articlePath = path.join(
						helpRoot,
						category.slug,
						`${summary.slug}${MARKDOWN_EXTENSION}`
					);
					const raw = await fs.readFile(articlePath, "utf8");
					const { content } = parseMarkdownDocument(raw);

					articleLookup.set(`${category.slug}/${summary.slug}`, {
						...summary,
						content,
					});
				})
			);
		})
	);

	return {
		categories,
		articleLookup,
	};
});

export async function getHelpCategories(): Promise<HelpCategory[]> {
	const { categories } = await loadHelpCenter();
	return categories;
}

export async function getHelpCategory(
	categorySlug: string
): Promise<HelpCategory | null> {
	const { categories } = await loadHelpCenter();
	return categories.find((category) => category.slug === categorySlug) ?? null;
}

export async function getHelpArticle(
	categorySlug: string,
	articleSlug: string
): Promise<HelpArticle | null> {
	const { articleLookup } = await loadHelpCenter();
	return articleLookup.get(`${categorySlug}/${articleSlug}`) ?? null;
}

export async function getHelpCategoryParams(): Promise<Array<{ category: string }>> {
	const categories = await getHelpCategories();
	if (!categories.length) {
		return [{ category: FALLBACK_CATEGORY_PARAM }];
	}
	return categories.map((category) => ({ category: category.slug }));
}

export async function getHelpArticleParams(): Promise<
	Array<{ category: string; slug: string }>
> {
	const categories = await getHelpCategories();
	const params = categories.flatMap((category) =>
		category.articles.map((article) => ({
			category: category.slug,
			slug: article.slug,
		}))
	);
	if (!params.length) {
		return [
			{
				category: FALLBACK_CATEGORY_PARAM,
				slug: FALLBACK_ARTICLE_PARAM,
			},
		];
	}
	return params;
}
