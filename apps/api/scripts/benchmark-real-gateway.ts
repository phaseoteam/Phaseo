import "dotenv/config";

type Sample = {
	status: number;
	headersMs: number;
	firstFrameMs: number | null;
	firstContentMs: number | null;
	completeMs: number;
	serverTiming: Record<string, number>;
	requestId: string | null;
};

const gatewayUrl = String(process.env.GATEWAY_URL ?? "").replace(/\/$/, "");
const apiKey = String(
	process.env.GATEWAY_API_KEY ??
	process.env.AI_STATS_PERFORMANCE_TEST_KEY ??
	process.env.PLAYGROUND_KEY ??
	"",
).trim();
const model = String(process.env.GATEWAY_MODEL ?? "poolside/laguna-s-2.1:free").trim();
const warmups = Math.max(0, Number(process.env.BENCHMARK_WARMUPS ?? 2));
const requests = Math.max(1, Number(process.env.BENCHMARK_REQUESTS ?? 10));
const concurrency = Math.max(1, Number(process.env.BENCHMARK_CONCURRENCY ?? 1));
const maxTokens = Math.max(1, Number(process.env.BENCHMARK_MAX_TOKENS ?? 8));
const provider = process.env.GATEWAY_PROVIDER?.trim();
if (![warmups, requests, concurrency, maxTokens].every(Number.isSafeInteger)) throw new Error("Benchmark counts must be finite integers");

if (!gatewayUrl) throw new Error("GATEWAY_URL is required");
if (!apiKey) throw new Error("GATEWAY_API_KEY is required");

function parseServerTiming(value: string | null): Record<string, number> {
	const result: Record<string, number> = {};
	for (const entry of String(value ?? "").split(",")) {
		const [namePart, ...parameters] = entry.trim().split(";");
		const duration = parameters
			.map((parameter) => parameter.trim().match(/^dur=([0-9.]+)$/)?.[1])
			.find(Boolean);
		if (namePart && duration) result[namePart] = Number(duration);
	}
	return result;
}

async function sample(): Promise<Sample> {
	const started = performance.now();
	const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
		method: "POST",
		signal: AbortSignal.timeout(120_000),
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify({
			model,
			stream: true,
			max_tokens: maxTokens,
			...(provider ? { provider: { only: [provider], allow_fallbacks: false } } : {}),
			messages: [{ role: "user", content: "Reply with exactly OK" }],
		}),
	});
	const headersMs = performance.now() - started;
	const reader = response.body?.getReader();
	let firstFrameMs: number | null = null;
	let firstContentMs: number | null = null;
	let buffered = "";
	let errorBody = "";
	let sawTerminalFrame = false;
	if (reader) {
		const decoder = new TextDecoder();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value, { stream: true });
				if (!response.ok) {
					errorBody = (errorBody + chunk).slice(0, 1_000);
					continue;
				}
				buffered += chunk;
				let separator: RegExpExecArray | null;
				while ((separator = /\r?\n\r?\n/.exec(buffered))) {
					const frame = buffered.slice(0, separator.index);
					buffered = buffered.slice(separator.index + separator[0].length);
					firstFrameMs ??= performance.now() - started;
					const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
					if (data === "[DONE]") { sawTerminalFrame = true; continue; }
					if (!data) continue;
					const payload = JSON.parse(data);
					if (payload.error) throw new Error(`Gateway stream error: ${JSON.stringify(payload.error).slice(0, 500)}`);
					if (payload.choices?.some((choice: { finish_reason?: string | null }) => choice.finish_reason != null)) sawTerminalFrame = true;
					if (payload.choices?.some((choice: { delta?: { content?: unknown } }) => typeof choice.delta?.content === "string" && choice.delta.content.length > 0)) {
						firstContentMs ??= performance.now() - started;
					}
				}
				if (buffered.length > 1_048_576) throw new Error("SSE frame exceeds benchmark buffer limit");
			}
		} finally {
			await reader.cancel().catch(() => undefined);
			reader.releaseLock();
		}
	}
	const completeMs = performance.now() - started;
	if (!response.ok) {
		throw new Error(`Gateway returned ${response.status}: ${errorBody.slice(0, 500)}`);
	}
	if (!sawTerminalFrame || firstContentMs === null) throw new Error("Gateway returned an incomplete stream or no content");
	return {
		status: response.status,
		headersMs,
		firstFrameMs,
		firstContentMs,
		completeMs,
		serverTiming: parseServerTiming(response.headers.get("server-timing")),
		requestId: response.headers.get("x-request-id") ?? response.headers.get("x-phaseo-request-id"),
	};
}

function percentile(values: number[], percentileValue: number): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)] ?? null;
}

function summarize(values: number[]) {
	return {
		p50: percentile(values, 0.5),
		p95: percentile(values, 0.95),
		p99: percentile(values, 0.99),
	};
}

for (let index = 0; index < warmups; index += 1) await sample();
const samples: Sample[] = [];
for (let index = 0; index < requests; index += concurrency) {
	samples.push(...await Promise.all(Array.from({ length: Math.min(concurrency, requests - index) }, () => sample())));
}

const timingNames = [...new Set(samples.flatMap((entry) => Object.keys(entry.serverTiming)))].sort();
const serverTiming = Object.fromEntries(
	timingNames.map((name) => [name, summarize(samples.flatMap((entry) => {
		const value = entry.serverTiming[name];
		return Number.isFinite(value) ? [value] : [];
	}))]),
);

console.log(JSON.stringify({
	gatewayUrl,
	model,
	warmups,
	requests,
	concurrency,
	maxTokens,
	provider,
	statusCounts: Object.fromEntries([...new Set(samples.map((entry) => entry.status))].map((status) => [status, samples.filter((entry) => entry.status === status).length])),
	client: {
		responseHeadersMs: summarize(samples.map((entry) => entry.headersMs)),
		firstSseFrameMs: summarize(samples.flatMap((entry) => entry.firstFrameMs === null ? [] : [entry.firstFrameMs])),
		firstContentMs: summarize(samples.flatMap((entry) => entry.firstContentMs === null ? [] : [entry.firstContentMs])),
		streamCompleteMs: summarize(samples.map((entry) => entry.completeMs)),
	},
	serverTiming,
	requestIdsObserved: samples.filter((entry) => entry.requestId).length,
	samples,
}, null, 2));
