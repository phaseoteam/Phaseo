import "dotenv/config";

type Sample = {
	status: number;
	headersMs: number;
	firstFrameMs: number | null;
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
const model = String(process.env.GATEWAY_MODEL ?? "poolside/laguna-s-2.1").trim();
const warmups = Math.max(0, Number(process.env.BENCHMARK_WARMUPS ?? 2));
const requests = Math.max(1, Number(process.env.BENCHMARK_REQUESTS ?? 10));

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
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			Accept: "text/event-stream",
		},
		body: JSON.stringify({
			model,
			stream: true,
			max_tokens: 8,
			messages: [{ role: "user", content: "Reply with exactly OK" }],
		}),
	});
	const headersMs = performance.now() - started;
	const reader = response.body?.getReader();
	let firstFrameMs: number | null = null;
	let buffered = "";
	let errorBody = "";
	if (reader) {
		const decoder = new TextDecoder();
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffered += decoder.decode(value, { stream: true });
			if (firstFrameMs === null && /\r?\n\r?\n/.test(buffered)) {
				firstFrameMs = performance.now() - started;
			}
			if (!response.ok && errorBody.length < 1_000) errorBody += buffered.slice(errorBody.length, 1_000);
		}
	}
	const completeMs = performance.now() - started;
	if (!response.ok) {
		throw new Error(`Gateway returned ${response.status}: ${errorBody.slice(0, 500)}`);
	}
	return {
		status: response.status,
		headersMs,
		firstFrameMs,
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
for (let index = 0; index < requests; index += 1) samples.push(await sample());

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
	statusCounts: Object.fromEntries([...new Set(samples.map((entry) => entry.status))].map((status) => [status, samples.filter((entry) => entry.status === status).length])),
	client: {
		responseHeadersMs: summarize(samples.map((entry) => entry.headersMs)),
		firstSseFrameMs: summarize(samples.flatMap((entry) => entry.firstFrameMs === null ? [] : [entry.firstFrameMs])),
		streamCompleteMs: summarize(samples.map((entry) => entry.completeMs)),
	},
	serverTiming,
	requestIdsObserved: samples.filter((entry) => entry.requestId).length,
}, null, 2));
