import { performance } from "node:perf_hooks";

function parseArgs(argv) {
	const values = new Map();
	for (let index = 0; index < argv.length; index += 1) {
		const entry = argv[index];
		if (!entry.startsWith("--")) continue;
		const [inlineKey, inlineValue] = entry.slice(2).split("=", 2);
		if (inlineValue !== undefined) values.set(inlineKey, inlineValue);
		else if (argv[index + 1] && !argv[index + 1].startsWith("--")) values.set(inlineKey, argv[++index]);
		else values.set(inlineKey, "true");
	}
	return values;
}

function positiveInteger(value, fallback) {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values, fraction) {
	if (!values.length) return null;
	const sorted = [...values].sort((left, right) => left - right);
	return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summary(values) {
	if (!values.length) return null;
	return {
		min: Math.min(...values),
		avg: values.reduce((total, value) => total + value, 0) / values.length,
		p50: percentile(values, 0.5),
		p95: percentile(values, 0.95),
		p99: percentile(values, 0.99),
		max: Math.max(...values),
	};
}

function rounded(value) {
	if (value === null) return null;
	return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, Number(number.toFixed(3))]));
}

function parseServerTiming(header) {
	const result = {};
	for (const entry of (header ?? "").split(",")) {
		const match = entry.trim().match(/^([^;]+);dur=([0-9.]+)/);
		if (match) result[match[1]] = Number(match[2]);
	}
	return result;
}

async function consumeStream(response, startedAt) {
	if (!response.body) return { firstFrameMs: null, totalMs: performance.now() - startedAt };
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffered = "";
	let firstFrameMs = null;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (firstFrameMs === null && value?.byteLength) {
			buffered += decoder.decode(value, { stream: true });
			if (buffered.includes("\n\n")) firstFrameMs = performance.now() - startedAt;
		}
	}
	return { firstFrameMs, totalMs: performance.now() - startedAt };
}

const args = parseArgs(process.argv.slice(2));
const url = args.get("url") ?? process.env.GATEWAY_URL;
const apiKey = args.get("key") ?? process.env.GATEWAY_API_KEY;
const model = args.get("model") ?? process.env.GATEWAY_MODEL;
if (!url || !apiKey || !model) {
	console.error("Usage: pnpm benchmark -- --url <gateway/v1/chat/completions> --key <key> --model <model> [--requests 200 --concurrency 10 --warmup 20]");
	process.exit(2);
}

const requests = positiveInteger(args.get("requests"), 200);
const concurrency = Math.min(positiveInteger(args.get("concurrency"), 10), 100);
const warmup = positiveInteger(args.get("warmup"), 20);
const testId = args.get("test-id");
const internalToken = args.get("internal-token") ?? process.env.GATEWAY_INTERNAL_TEST_TOKEN;
const timeoutMs = positiveInteger(args.get("timeout-ms"), 30_000);

async function runOne(index) {
	const startedAt = performance.now();
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const headers = {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		};
		if (testId) headers["X-Test-Id"] = `${testId}-${index}`.slice(0, 128);
		if (internalToken) {
			headers["X-Phaseo-Internal-Token"] = internalToken;
			headers["X-Phaseo-Testing-Mode"] = "true";
		}
		const response = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify({
				model,
				stream: true,
				messages: [{ role: "user", content: "Reply with one word." }],
			}),
			signal: controller.signal,
		});
		const headersMs = performance.now() - startedAt;
		const stream = await consumeStream(response, startedAt);
		return {
			ok: response.ok,
			status: response.status,
			headersMs,
			firstFrameMs: stream.firstFrameMs,
			totalMs: stream.totalMs,
			serverTiming: parseServerTiming(response.headers.get("server-timing")),
		};
	} catch (error) {
		return {
			ok: false,
			status: 0,
			headersMs: null,
			firstFrameMs: null,
			totalMs: performance.now() - startedAt,
			serverTiming: {},
			error: error instanceof Error ? error.message : String(error),
		};
	} finally {
		clearTimeout(timeout);
	}
}

async function runBatch(count, width) {
	const results = new Array(count);
	let next = 0;
	await Promise.all(Array.from({ length: Math.min(width, count) }, async () => {
		while (true) {
			const index = next++;
			if (index >= count) return;
			results[index] = await runOne(index);
		}
	}));
	return results;
}

await runBatch(warmup, Math.min(concurrency, warmup));
const startedAt = performance.now();
const results = await runBatch(requests, concurrency);
const wallMs = performance.now() - startedAt;
const successful = results.filter((result) => result.ok);
const serverMetricNames = new Set(successful.flatMap((result) => Object.keys(result.serverTiming)));
const serverTiming = Object.fromEntries([...serverMetricNames].sort().map((name) => [
	name,
	rounded(summary(successful.map((result) => result.serverTiming[name]).filter(Number.isFinite))),
]));
const report = {
	target: url,
	model,
	requests,
	concurrency,
	warmup,
	successes: successful.length,
	failures: results.length - successful.length,
	requestsPerSecond: Number((requests / (wallMs / 1000)).toFixed(3)),
	clientMs: {
		responseHeaders: rounded(summary(successful.map((result) => result.headersMs).filter(Number.isFinite))),
		firstSseFrame: rounded(summary(successful.map((result) => result.firstFrameMs).filter(Number.isFinite))),
		streamComplete: rounded(summary(successful.map((result) => result.totalMs).filter(Number.isFinite))),
	},
	serverTiming,
	statuses: Object.fromEntries([...new Set(results.map((result) => result.status))].sort().map((status) => [
		status,
		results.filter((result) => result.status === status).length,
	])),
};

console.log(JSON.stringify(report, null, 2));
if (successful.length !== requests) process.exitCode = 1;
