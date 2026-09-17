export const DEFAULT_MODEL_DISCOVERY_CONCURRENCY = 8;
export const MAX_MODEL_DISCOVERY_CONCURRENCY = 16;

export function normalizeModelDiscoveryConcurrency(concurrency: number): number {
	const normalized = Number.isFinite(concurrency) ? Math.floor(concurrency) : DEFAULT_MODEL_DISCOVERY_CONCURRENCY;
	return Math.min(Math.max(normalized, 1), MAX_MODEL_DISCOVERY_CONCURRENCY);
}

/**
 * Run independent provider checks concurrently while keeping the returned
 * values in the same order as the input. Stable ordering makes summaries and
 * notifications reproducible even when providers finish at different times.
 */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	if (items.length === 0) return [];

	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workerCount = Math.min(normalizeModelDiscoveryConcurrency(concurrency), items.length);

	async function worker(): Promise<void> {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) return;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(Array.from({ length: workerCount }, () => worker()));
	return results;
}
