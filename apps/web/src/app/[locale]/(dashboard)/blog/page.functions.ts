// Blog posts are read from src/content with node:fs, and future-post previews
// depend on the viewer (admin) and environment, so the list loads on the server.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type { PublicLocale } from "@/i18n/routing";
import type { AnnouncementSummary } from "@/lib/content/announcements";

export type BlogIndexPost = AnnouncementSummary & { isPreview: boolean };

export const getBlogIndexPosts = createServerFn({ method: "GET" })
	.validator((locale: PublicLocale) => locale)
	.handler(async ({ data: locale }): Promise<BlogIndexPost[]> => {
		const [{ canPreviewFutureBlogPosts }, { getAnnouncementPosts, isAnnouncementPublished }] = await Promise.all([
			import("@/lib/flags/blogPreview"),
			import("@/lib/content/announcements"),
		]);
		const posts = await canPreviewFutureBlogPosts().then((canPreviewFuturePosts) =>
			getAnnouncementPosts({ includeFuture: canPreviewFuturePosts, locale })
		);
		return posts.map((post) => ({ ...post, isPreview: !isAnnouncementPublished(post.publishedAt) }));
	});

export const blogIndexPostsQuery = (locale: PublicLocale) =>
	queryOptions({
		queryKey: ["blog-index-posts", locale],
		queryFn: () => getBlogIndexPosts({ data: locale }),
	});
