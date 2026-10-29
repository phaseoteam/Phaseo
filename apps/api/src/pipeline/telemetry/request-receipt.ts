// Epoch time at which the Worker received each request. Middleware such as the
// customer quota check authenticates before the pipeline timer exists; starting
// the timer here keeps that time inside Phaseo's measured overhead.
const receipts = new WeakMap<Request, number>();

export function markRequestReceived(request: Request, at = Date.now()): void {
	receipts.set(request, at);
}

export function requestReceivedAtMs(request: Request): number | undefined {
	return receipts.get(request);
}

/** Carries the receipt time onto a rebuilt request, such as a header-sanitized copy. */
export function inheritRequestReceipt(source: Request, target: Request): void {
	const at = receipts.get(source);
	if (at !== undefined) receipts.set(target, at);
}
