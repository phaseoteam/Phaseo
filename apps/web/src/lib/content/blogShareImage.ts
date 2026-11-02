import { DYNAMIC_OG_LIMITS, parseDynamicOgParams } from "@/lib/og/dynamicOg";

export type BlogShareImage = {
	path: string;
	// Omitted for covers, whose size isn't known here.
	size?: { width: number; height: number };
};

// Social previews don't render SVG, so only raster covers can be shared.
const RASTER_COVER = /\.(png|jpe?g|webp)$/i;
const DYNAMIC_OG_SIZE = { width: 1200, height: 630 };

function truncate(value: string, max: number): string {
	if (value.length <= max) return value;
	const cut = value.slice(0, max - 1);
	const lastSpace = cut.lastIndexOf(" ");
	return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function dynamicOgPath(fields: Record<string, string>): string | null {
	const params = new URLSearchParams(fields);
	return parseDynamicOgParams(params).ok ? `/og/dynamic?${params.toString()}` : null;
}

// A post's share image: its own cover when it has a raster one, otherwise a
// /og/dynamic card with its title. Text the card would refuse (such as
// non-Latin translations) falls back to the site default image.
export function blogShareImage(post: {
	slug: string;
	title: string;
	description: string;
	coverImage: string;
}): BlogShareImage | null {
	if (RASTER_COVER.test(post.coverImage)) return { path: post.coverImage };

	const title = truncate(post.title, DYNAMIC_OG_LIMITS.title);
	const pathname = `/blog/${post.slug}`;
	const path =
		dynamicOgPath({
			title,
			description: truncate(post.description, DYNAMIC_OG_LIMITS.description),
			pathname,
		}) ??
		dynamicOgPath({ title, pathname }) ??
		dynamicOgPath({ title });

	return path ? { path, size: DYNAMIC_OG_SIZE } : null;
}
