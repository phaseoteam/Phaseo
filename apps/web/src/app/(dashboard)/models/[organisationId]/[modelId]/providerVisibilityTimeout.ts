export function withOptionalProviderVisibilityTimeout<T>(
	promise: Promise<T>,
	fallback: T,
	timeoutMs: number,
	onTimeout?: () => void,
): Promise<T> {
	let timeout: ReturnType<typeof setTimeout> | null = null;
	const timeoutPromise = new Promise<T>((resolve) => {
		timeout = setTimeout(() => {
			onTimeout?.();
			resolve(fallback);
		}, timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => {
		if (timeout) clearTimeout(timeout);
	});
}
