// Keep background work alive after the response on Workers.
export async function waitUntil(promise: Promise<unknown>): Promise<void> {
	try {
		const workers = (await import(/* @vite-ignore */ "cloudflare:workers")) as { waitUntil?: (p: Promise<unknown>) => void };
		if (workers.waitUntil) {
			workers.waitUntil(promise.catch(() => undefined));
			return;
		}
	} catch {
		// Not running on Workers.
	}
	void promise.catch(() => undefined);
}
