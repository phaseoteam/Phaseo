import "server-only";

import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";

const ANNOUNCEMENTS_CONTENT_ROOT = path.join(
	process.cwd(),
	"src",
	"content",
	"announcements"
);
const SUPPORTED_EXTENSIONS = [".mdx", ".md"] as const;
const EXCLUDED_ANNOUNCEMENT_SLUGS = new Set([
	"readme",
	"welcome-to-announcements",
]);

type AnnouncementFrontmatterInput = {
	title?: unknown;
	description?: unknown;
	publishedAt?: unknown;
	updatedAt?: unknown;
	author?: unknown;
	tags?: unknown;
	coverImage?: unknown;
	draft?: unknown;
};

export type AnnouncementSummary = {
	slug: string;
	title: string;
	description: string;
	excerpt: string;
	publishedAt: string;
	updatedAt: string | null;
	author: string | null;
	tags: string[];
	coverImage: string | null;
};

export type AnnouncementPost = AnnouncementSummary & {
	content: string;
};

function parseDocument(raw: string): {
	frontmatter: AnnouncementFrontmatterInput;
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
			? (parsed as AnnouncementFrontmatterInput)
			: {};

	return {
		frontmatter,
		content: normalized.slice(match[0].length).trim(),
	};
}

function toTitleFromSlug(slug: string): string {
	return slug
		.split("-")
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(" ");
}

function toStringOrFallback(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: fallback;
}

function toOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: null;
}

function toIsoDate(value: unknown, fallback: string): string {
	if (value instanceof Date) {
		return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
	}

	if (typeof value !== "string" || value.trim().length === 0) {
		return fallback;
	}

	const parsed = new Date(value.trim());
	if (Number.isNaN(parsed.getTime())) {
		return fallback;
	}

	return parsed.toISOString();
}

function toTags(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.filter((item): item is string => typeof item === "string")
			.map((item) => item.trim())
			.filter(Boolean);
	}

	if (typeof value === "string" && value.trim().length > 0) {
		return value
			.split(",")
			.map((tag) => tag.trim())
			.filter(Boolean);
	}

	return [];
}

function isDraft(value: unknown): boolean {
	return value === true || value === "true";
}

function toExcerpt(content: string, maxLength = 220): string {
	const cleaned = content
		.replace(/```[\s\S]*?```/g, " ")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/^\s*#{1,6}\s+/gm, "")
		.replace(/\r?\n+/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	if (!cleaned) {
		return "No summary yet.";
	}

	return cleaned.length > maxLength
		? `${cleaned.slice(0, maxLength - 3)}...`
		: cleaned;
}

function dateToSortValue(value: string): number {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function loadAnnouncements(): Promise<AnnouncementPost[]> {
	let entries: Dirent[];

	try {
		entries = await fs.readdir(ANNOUNCEMENTS_CONTENT_ROOT, {
			withFileTypes: true,
		});
	} catch {
		return [];
	}

	const fileEntries = entries.filter(
		(entry) =>
			entry.isFile() &&
			SUPPORTED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
	);

	const posts = await Promise.all(
		fileEntries.map(async (entry): Promise<AnnouncementPost | null> => {
			const extension = SUPPORTED_EXTENSIONS.find((candidate) =>
				entry.name.endsWith(candidate)
			);
			if (!extension) return null;

			const filePath = path.join(ANNOUNCEMENTS_CONTENT_ROOT, entry.name);
			const slug = entry.name.slice(0, -extension.length);
			if (EXCLUDED_ANNOUNCEMENT_SLUGS.has(slug.toLowerCase())) {
				return null;
			}

			const raw = await fs.readFile(filePath, "utf8");
			const { frontmatter, content } = parseDocument(raw);

			if (isDraft(frontmatter.draft)) {
				return null;
			}

			const stats = await fs.stat(filePath);
			const fallbackDate = stats.mtime.toISOString();
			const title = toStringOrFallback(frontmatter.title, toTitleFromSlug(slug));
			const description = toStringOrFallback(
				frontmatter.description,
				toExcerpt(content, 180)
			);
			const publishedAt = toIsoDate(frontmatter.publishedAt, fallbackDate);
			const updatedAt = toOptionalString(frontmatter.updatedAt);

			return {
				slug,
				title,
				description,
				excerpt: toExcerpt(content),
				publishedAt,
				updatedAt,
				author: toOptionalString(frontmatter.author),
				tags: toTags(frontmatter.tags),
				coverImage: toOptionalString(frontmatter.coverImage),
				content,
			};
		})
	);

	return posts
		.filter((post): post is AnnouncementPost => post !== null)
		.sort((a, b) => {
			const dateDiff = dateToSortValue(b.publishedAt) - dateToSortValue(a.publishedAt);
			if (dateDiff !== 0) return dateDiff;
			return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
		});
}

export async function getAnnouncementPosts(): Promise<AnnouncementSummary[]> {
	const posts = await loadAnnouncements();
	return posts.map(({ content: _content, ...summary }) => summary);
}

export async function getAnnouncementPost(
	slug: string
): Promise<AnnouncementPost | null> {
	const posts = await loadAnnouncements();
	return posts.find((post) => post.slug === slug) ?? null;
}

export async function getAnnouncementParams(): Promise<Array<{ slug: string }>> {
	const posts = await loadAnnouncements();
	return posts.map((post) => ({ slug: post.slug }));
}

export function formatAnnouncementDate(value: string): string {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}

	return parsed.toLocaleDateString(undefined, {
		timeZone: "UTC",
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}
