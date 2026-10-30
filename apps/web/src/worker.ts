// Experiment: an HTML cache in front of vinext's Worker handler.
//
// Only anonymous GET document requests are cached (no auth cookies, no RSC
// navigation headers). The key includes the locale cookie and the preferred
// language, because the proxy picks the locale from them. Set-Cookie is
// stripped from cached copies. The Cache API is per data centre.
import vinextHandler from "vinext/server/fetch-handler";

export * from "vinext/server/fetch-handler";

type Handler = { fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> };
const handler = vinextHandler as unknown as Handler;

const PRIVATE_COOKIE = /(?:^|;\s*)(?:sb-|phaseo-auth|__session|session)[^=]*=/i;
const NAVIGATION_HEADERS = ["rsc", "next-router-state-tree", "next-router-prefetch", "next-action"];

function cacheKey(request: Request): Request | null {
	if (request.method !== "GET") return null;
	const accept = request.headers.get("accept") ?? "";
	if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return null;
	if (NAVIGATION_HEADERS.some((name) => request.headers.has(name))) return null;
	const cookie = request.headers.get("cookie") ?? "";
	if (PRIVATE_COOKIE.test(cookie)) return null;
	const locale = /(?:^|;\s*)PHASEO_LOCALE=([^;]+)/.exec(cookie)?.[1] ?? "-";
	const language = (request.headers.get("accept-language") ?? "").split(",")[0]?.trim().toLowerCase() || "-";
	const url = new URL(request.url);
	url.searchParams.set("__phaseo_cache", `${locale}|${language}`);
	return new Request(url.toString(), { method: "GET" });
}

export default {
	async fetch(request: Request, env: { HTML_CACHE_TTL?: string }, ctx: ExecutionContext): Promise<Response> {
		const ttl = Number(env.HTML_CACHE_TTL ?? "0");
		const key = ttl > 0 ? cacheKey(request) : null;
		if (!key) return handler.fetch(request, env, ctx);

		const cache = (caches as unknown as { default: Cache }).default;
		const cached = await cache.match(key);
		if (cached) {
			const hit = new Response(cached.body, cached);
			hit.headers.set("x-phaseo-cache", "HIT");
			return hit;
		}

		const response = await handler.fetch(request, env, ctx);
		const type = response.headers.get("content-type") ?? "";
		if (response.status !== 200 || !type.includes("text/html")) {
			const passthrough = new Response(response.body, response);
			passthrough.headers.set("x-phaseo-cache", "BYPASS");
			return passthrough;
		}
		const [forClient, forCache] = response.body ? response.body.tee() : [null, null];
		const stored = new Response(forCache, response);
		stored.headers.delete("set-cookie");
		stored.headers.set("cache-control", `public, max-age=0, s-maxage=${ttl}`);
		ctx.waitUntil(cache.put(key, stored).catch(() => undefined));
		const miss = new Response(forClient, response);
		miss.headers.set("x-phaseo-cache", "MISS");
		return miss;
	},
};
