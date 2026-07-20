export type PublicCachePolicy = {
  edgeTtlSeconds: number;
  staleWhileRevalidateSeconds?: number;
	browserTtlSeconds?: number;
	cacheTags?: readonly string[];
};

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
} as const;

export function publicCacheHeaders(policy: PublicCachePolicy): Record<string, string> {
	const staleWhileRevalidateSeconds = policy.staleWhileRevalidateSeconds ?? 0;
	const browserTtlSeconds = policy.browserTtlSeconds ?? 60;
	const edgeDirectives = [
		"public",
		`max-age=${policy.edgeTtlSeconds}`,
		staleWhileRevalidateSeconds > 0
			? `stale-while-revalidate=${staleWhileRevalidateSeconds}`
			: null,
	].filter(Boolean);

	return {
		// The browser gets a short freshness window while shared caches retain the
		// catalogue for the full edge lifetime.
		"Cache-Control": [
			"public",
			`max-age=${browserTtlSeconds}`,
			`s-maxage=${policy.edgeTtlSeconds}`,
			staleWhileRevalidateSeconds > 0
				? `stale-while-revalidate=${staleWhileRevalidateSeconds}`
				: null,
		]
			.filter(Boolean)
			.join(", "),
		"Cloudflare-CDN-Cache-Control": edgeDirectives.join(", "),
		...(policy.cacheTags?.length ? { "Cache-Tag": policy.cacheTags.join(",") } : {}),
	};
}

/** Only use on anonymous, response-identical routes. */
export function withPublicCache(response: Response, policy: PublicCachePolicy): Response {
	const headers = new Headers(response.headers);
	for (const [name, value] of Object.entries(publicCacheHeaders(policy))) {
		headers.set(name, value);
	}
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}
