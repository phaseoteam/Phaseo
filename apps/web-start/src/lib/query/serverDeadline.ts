/** One budget for the entire server operation, including sequential requests. */
export async function withServerDeadline<T>(
	operation: (signal: AbortSignal) => Promise<T>,
	timeoutMs = 15_000,
): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			const error = new DOMException("Server data loading timed out", "TimeoutError");
			controller.abort(error);
			reject(error);
		}, timeoutMs);
	});
	try {
		return await Promise.race([operation(controller.signal), deadline]);
	} finally {
		clearTimeout(timer);
	}
}
