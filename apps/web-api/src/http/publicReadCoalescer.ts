import type { MiddlewareHandler } from "hono";
import type { Env } from "@/env";

type BufferedResponse = {
	body: ArrayBuffer | null;
	status: number;
	statusText: string;
	headers: [string, string][];
};

async function bufferResponse(response: Response): Promise<BufferedResponse> {
	return {
		body: response.body === null ? null : await response.arrayBuffer(),
		status: response.status,
		statusText: response.statusText,
		headers: [...response.headers],
	};
}

function toResponse(buffered: BufferedResponse): Response {
	return new Response(buffered.body === null ? null : buffered.body.slice(0), {
		status: buffered.status,
		statusText: buffered.statusText,
		headers: buffered.headers,
	});
}

/** Collapse simultaneous anonymous misses. Completed responses belong to
 * Workers Cache, so tagged purges cannot be defeated by a second local TTL.
 *
 * Workers forbid one request from reading a body stream that belongs to
 * another request ("Cannot perform I/O on behalf of a different request"), so
 * the leader reads the body into memory once and every caller, the leader
 * included, gets its own Response built from those bytes.
 */
export function createPublicReadCoalescer(): MiddlewareHandler<{ Bindings: Env }> {
	const pending = new Map<string, Promise<BufferedResponse | null>>();
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
			const shared = await existing;
			if (shared) {
				c.res = toResponse(shared);
				return;
			}
			// The leader failed before producing a response; do this request's own work.
			await next();
			return;
		}
		let settle!: (value: BufferedResponse | null) => void;
		pending.set(key, new Promise((resolve) => { settle = resolve; }));
		let shared: BufferedResponse | null = null;
		try {
			await next();
			shared = await bufferResponse(c.res);
			c.res = toResponse(shared);
		} finally {
			pending.delete(key);
			settle(shared);
		}
	};
}
