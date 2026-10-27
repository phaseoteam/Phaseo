const inflight = new Map<string, Promise<unknown>>();

/**
 * Shares one copy of an expensive derived payload between the many small
 * responses built from it, per colo through the Cache API and per isolate
 * while it loads. Tagged purges cannot reach these internal entries, so the
 * TTL bounds how stale a derived response can be.
 */
export async function sharedPayload<T>(name: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
	const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
	if (!cache) return load();
	const key = `https://web-api.internal/shared-payload/${name}`;
	const pending = inflight.get(key) as Promise<T> | undefined;
	if (pending) return pending;
	const request = (async () => {
		const cached = await cache.match(key).catch(() => undefined);
		if (cached) {
			const payload = await cached.json().catch(() => null);
			if (payload != null) return payload as T;
		}
		const payload = await load();
		await cache.put(key, new Response(JSON.stringify(payload), {
			headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlSeconds}` },
		})).catch(() => {});
		return payload;
	})();
	inflight.set(key, request);
	try {
		return await request;
	} finally {
		inflight.delete(key);
	}
}
