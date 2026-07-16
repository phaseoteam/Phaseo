import type { ExecutorResult, ExecutorTiming } from "@executors/types";

function finiteDuration(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value)
		? Math.max(0, value)
		: null;
}

function completedOutputTokens(result: ExecutorResult): number {
	if (result.kind !== "completed") return 0;
	const usage = (result.ir as any)?.usage;
	const value = usage?.outputTokens ?? usage?.output_tokens ?? usage?.completion_tokens;
	const tokens = Number(value);
	return Number.isFinite(tokens) && tokens > 0 ? tokens : 0;
}

function normalizeBufferedTiming(
	timing: ExecutorTiming,
	providerStartedAtMs: number,
	hasOutput: boolean,
): void {
	const totalMs = finiteDuration(timing.totalMs) ?? Math.max(0, Date.now() - providerStartedAtMs);
	let latencyMs = finiteDuration(timing.latencyMs);
	let generationMs = finiteDuration(timing.generationMs);

	if (generationMs === null && latencyMs !== null) {
		generationMs = Math.max(0, totalMs - latencyMs);
	}
	if (latencyMs === null && generationMs !== null) {
		latencyMs = Math.max(0, totalMs - generationMs);
	}
	if (latencyMs === null && generationMs === null) {
		latencyMs = hasOutput ? 0 : totalMs;
		generationMs = hasOutput ? totalMs : 0;
	}

	// A buffered response can expose all output in the same clock tick. In that
	// case TTFT and generation cannot be separated, so attribute the provider
	// duration to generation instead of reporting a misleading zero throughput.
	if (hasOutput && generationMs <= 2 && totalMs > 2) {
		latencyMs = 0;
		generationMs = totalMs;
	}

	timing.latencyMs = latencyMs;
	timing.generationMs = generationMs;
	timing.totalMs = totalMs;
}

function measureExecutorStream(
	stream: ReadableStream<Uint8Array>,
	timing: ExecutorTiming,
	providerStartedAtMs: number,
): ReadableStream<Uint8Array> {
	const reader = stream.getReader();
	let firstByteAtMs: number | null = null;
	let settled = false;

	const recordProgress = (nowMs: number) => {
		if (firstByteAtMs === null) {
			firstByteAtMs = nowMs;
			timing.latencyMs = Math.max(0, nowMs - providerStartedAtMs);
		}
		timing.generationMs = Math.max(0, nowMs - firstByteAtMs);
		timing.totalMs = Math.max(0, nowMs - providerStartedAtMs);
	};

	const recordCompletion = () => {
		if (settled) return;
		settled = true;
		const nowMs = Date.now();
		const totalMs = Math.max(0, nowMs - providerStartedAtMs);
		if (firstByteAtMs === null) {
			timing.latencyMs = totalMs;
			timing.generationMs = 0;
		} else {
			const generationMs = Math.max(0, nowMs - firstByteAtMs);
			if (generationMs <= 2 && totalMs > 2) {
				timing.latencyMs = 0;
				timing.generationMs = totalMs;
			} else {
				timing.generationMs = generationMs;
			}
		}
		timing.totalMs = totalMs;
	};

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done } = await reader.read();
				if (done) {
					recordCompletion();
					controller.close();
					return;
				}
				if (value.byteLength > 0) recordProgress(Date.now());
				controller.enqueue(value);
			} catch (error) {
				recordCompletion();
				controller.error(error);
			}
		},
		async cancel(reason) {
			recordCompletion();
			await reader.cancel(reason);
		},
	});
}

export function instrumentTextExecutorTiming(
	result: ExecutorResult,
	providerStartedAtMs: number,
): ExecutorResult {
	const timing = result.timing ?? {};
	result.timing = timing;

	if (result.kind === "stream" && result.stream) {
		if (timing.streamTimingSource) return result;
		timing.streamTimingSource = "executor";
		result.stream = measureExecutorStream(result.stream, timing, providerStartedAtMs);
		return result;
	}

	if (result.kind === "completed") {
		normalizeBufferedTiming(timing, providerStartedAtMs, completedOutputTokens(result) > 0);
	}

	return result;
}
