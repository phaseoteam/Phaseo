// Browser-safe versions of `AbortSignal.timeout` and `AbortSignal.any`.
// iOS Safari only added `timeout` in 16 and `any` in 17.4, and calling either
// where it is missing throws a TypeError (PHA-522 crashed /models this way).
// Use these in any code that can run in the browser. Server-only code runs on
// Node, which has both natively.

function timeoutError(): unknown {
	return typeof DOMException === "function"
		? new DOMException("signal timed out", "TimeoutError")
		: undefined;
}

/** `AbortSignal.timeout(ms)`, falling back to an AbortController and a timer. */
export function timeoutSignal(ms: number): AbortSignal {
	if (typeof AbortSignal.timeout === "function") {
		return AbortSignal.timeout(ms);
	}

	const controller = new AbortController();
	// One-shot: the timer is gone once it fires, and nothing else holds it.
	setTimeout(() => controller.abort(timeoutError()), ms);
	return controller.signal;
}

/**
 * `AbortSignal.any(signals)`, falling back to an AbortController that follows
 * the first input to abort. The fallback removes every listener it added as
 * soon as any input aborts.
 */
export function anySignal(signals: readonly AbortSignal[]): AbortSignal {
	if (typeof AbortSignal.any === "function") {
		return AbortSignal.any(signals as AbortSignal[]);
	}

	const controller = new AbortController();
	const alreadyAborted = signals.find((signal) => signal.aborted);
	if (alreadyAborted) {
		controller.abort(alreadyAborted.reason);
		return controller.signal;
	}

	const onAbort = (event: Event) => {
		for (const signal of signals) {
			signal.removeEventListener("abort", onAbort);
		}
		controller.abort((event.target as AbortSignal).reason);
	};
	for (const signal of signals) {
		signal.addEventListener("abort", onAbort);
	}
	return controller.signal;
}
