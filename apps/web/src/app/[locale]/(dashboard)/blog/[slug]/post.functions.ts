import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import type { AnnouncementPost } from "@/lib/content/announcements";

export type BlogPostResolution =
	| { kind: "post"; post: Omit<AnnouncementPost, "content"> }
	| { kind: "redirect-to-index" }
	| { kind: "not-found" };

/** Same decisions as the Next page: previews for permitted viewers, redirect for unpublished posts, 404 otherwise. */
export const resolveBlogPost = createServerFn({ method: "GET" })
	.validator((input: { slug: string; locale: string }) => input)
	.handler(async ({ data }): Promise<BlogPostResolution> => {
		const [{ getAnnouncementPost, isAnnouncementPublished }, { canPreviewFutureBlogPosts }] = await Promise.all([
			import("@/lib/content/announcements"),
			import("@/lib/flags/blogPreview"),
		]);
		const canPreviewFuturePosts = await canPreviewFutureBlogPosts();
		const post = await getAnnouncementPost(data.slug, { includeFuture: canPreviewFuturePosts, locale: data.locale });
		if (!post) {
			if (!canPreviewFuturePosts) {
				const previewPost = await getAnnouncementPost(data.slug, { includeFuture: true, locale: data.locale });
				if (previewPost && !isAnnouncementPublished(previewPost.publishedAt)) return { kind: "redirect-to-index" };
			}
			return { kind: "not-found" };
		}
		if (!canPreviewFuturePosts && !isAnnouncementPublished(post.publishedAt)) return { kind: "not-found" };
		// The body is compiled at build time (virtual:phaseo-announcement-mdx); keep it out of the payload.
		const { content: _content, ...meta } = post;
		return { kind: "post", post: meta };
	});

export const blogPostQuery = (slug: string, locale: string) =>
	queryOptions({
		queryKey: ["phaseo-web", "blog-post", locale, slug],
		queryFn: () => resolveBlogPost({ data: { slug, locale } }),
	});
