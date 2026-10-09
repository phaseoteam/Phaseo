import type { MiddlewareHandler } from "hono";
import type { Env } from "@/env";

/** Collapse simultaneous anonymous misses. Completed responses belong to
 * Workers Cache, so tagged purges cannot be defeated by a second local TTL.
 */
export function createPublicReadCoalescer(): MiddlewareHandler<{ Bindings: Env }> {
	const pending = new Map<string, Promise<Response>>();
	return async (c, next) => {
		if (c.req.method !== "GET" || c.req.header("Authorization") || c.req.header("Cookie")) {
			await next();
			return;
		}
		const url = new URL(c.req.url);
		url.searchParams.sort();
		const databaseUrl = (c.env.SUPABASE_URL ?? c.env.NEXT_PUBLIC_SUPABASE_URL)?.trim();
		const key = JSON.stringify([c.env.ENV, databaseUrl, url.toString()]);
		const existing = pending.get(key);
		if (existing) {
			c.res = (await existing).clone();
			return;
		}
		const response = (async () => {
			await next();
			return c.res;
		})();
		pending.set(key, response);
		try {
			await response;
		} finally {
			pending.delete(key);
		}
	};
}
