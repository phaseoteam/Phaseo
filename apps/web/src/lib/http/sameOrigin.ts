const SAME_SITE_FETCHES = new Set(["same-origin", "none"]);

function parsedOrigin(value: string): string | null {
	try {
		return new URL(value).origin;
	} catch {
		return null;
	}
}

/**
 * True when a cookie-authenticated, state-changing request comes from this site's own pages.
 * Browsers send Origin on every POST, PUT, PATCH and DELETE, so it must match this origin. Without
 * Origin, the browser's Sec-Fetch-Site must say same-origin or none (typed or bookmarked); a request
 * with neither header is refused, since these routes are only called by the dashboard.
 */
export function isSameOriginRequest(request: Request): boolean {
	const expected = new URL(request.url).origin;
	const origin = request.headers.get("origin");
	if (origin !== null) return parsedOrigin(origin) === expected;
	const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
	return Boolean(fetchSite && SAME_SITE_FETCHES.has(fetchSite));
}

/** A 403 response for a cross-origin state-changing request, or null when it may continue. */
export function rejectCrossOriginRequest(request: Request): Response | null {
	if (isSameOriginRequest(request)) return null;
	return Response.json(
		{ error: "cross_origin_request", message: "This request must come from the Phaseo dashboard." },
		{ status: 403, headers: { "Cache-Control": "no-store" } },
	);
}
