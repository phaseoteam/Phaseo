// Purpose: Bounded waits on promises that another request may own.
// Why: Workers cancels a request's outstanding I/O when that request ends. A second
//      request awaiting the same promise then has nothing of its own pending and the
//      runtime kills it as hung ("code had hung and would never generate a response").
// How: Race the shared promise against a timer owned by the waiting request, and let
//      the caller fall back to its own work when the shared promise does not settle.

export type SharedWaitResult<T> = { settled: true; value: T } | { settled: false };

/**
 * Waits at most `ms` for `promise`. Rejections are reported as unsettled so the
 * caller retries with its own I/O instead of inheriting another request's error.
 */
export async function awaitShared<T>(promise: Promise<T>, ms: number): Promise<SharedWaitResult<T>> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise.then(
				(value): SharedWaitResult<T> => ({ settled: true, value }),
				(): SharedWaitResult<T> => ({ settled: false }),
			),
			new Promise<SharedWaitResult<T>>((resolve) => {
				timer = setTimeout(() => resolve({ settled: false }), ms);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
