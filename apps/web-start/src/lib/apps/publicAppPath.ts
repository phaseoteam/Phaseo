function slugifyAppName(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 64);
}

export function getPublicAppRouteSegment(title: string): string {
	return slugifyAppName(title) || "app";
}

export function getPublicAppPath(title: string, publicSlug?: string | null): string {
	const resolvedSlug = publicSlug?.trim() || getPublicAppRouteSegment(title);
	return `/apps/${encodeURIComponent(resolvedSlug)}`;
}
