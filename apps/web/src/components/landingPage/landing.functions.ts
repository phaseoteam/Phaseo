// Announcement posts are read from the content files on the server, so the
// landing sections load them through a server function.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

const loadLandingAnnouncementPosts = createServerFn({ method: "GET" })
	.validator((input: { locale: string; limit: number }) => ({ locale: String(input.locale), limit: Math.max(0, Math.floor(Number(input.limit) || 0)) }))
	.handler(async ({ data }) => {
		const { getAnnouncementPosts } = await import("@/lib/content/announcements");
		const posts = await getAnnouncementPosts({ locale: data.locale });
		return posts.slice(0, data.limit);
	});

/** The newest `limit` published announcement posts for `locale`. */
export const landingAnnouncementPostsQuery = (locale: string, limit: number) =>
	queryOptions({
		queryKey: ["landing", "announcement-posts", locale, limit],
		queryFn: () => loadLandingAnnouncementPosts({ data: { locale, limit } }),
	});
