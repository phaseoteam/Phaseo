import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

type ProviderTarget = "direct_openai_ws" | "gateway_openai_ws";

type ParsedWsEvent = {
	raw: string;
	data: unknown;
};

type ToolCall = {
	name: string;
	callId: string;
	arguments: string;
};

type TurnMetric = {
	turn: number;
	ttfbMs: number;
	totalMs: number;
	eventCount: number;
	toolCalls: number;
};

type RunMetric = {
	provider: ProviderTarget;
	run: number;
	turns: TurnMetric[];
	totalMs: number;
	firstTurnTtfbMs: number;
	finalResponseId: string | null;
};

type WsTurnResult = {
	ttfbMs: number;
	totalMs: number;
	events: ParsedWsEvent[];
	completedResponse: any;
};

type SummaryStats = {
	p50: number;
	p95: number;
	mean: number;
	min: number;
	max: number;
};

const BENCH_RUN = (process.env.OPENAI_WS_BENCH_RUN ?? "").trim() === "1";
const DIRECT_OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? "").trim();
const DIRECT_OPENAI_BASE_URL = normalizeOpenAIBaseUrl(
	process.env.OPENAI_BASE_URL ?? "https://api.openai.com",
);
const GATEWAY_HTTP_BASE_URL = normalizeGatewayBaseUrl(process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1");
const GATEWAY_WS_URL = normalizeGatewayWebSocketUrl(
	process.env.GATEWAY_WS_URL,
	GATEWAY_HTTP_BASE_URL,
);
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const DIRECT_MODEL = normalizeModelName(
	process.env.OPENAI_WS_BENCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-nano",
);
const GATEWAY_MODEL = `openai/${DIRECT_MODEL}`;

const ITERATIONS = clampInt(process.env.OPENAI_WS_BENCH_ITERS, 4, 1, 20);
const CONCURRENCY = clampInt(process.env.OPENAI_WS_BENCH_CONCURRENCY, 1, 1, 20);
const MAX_TURNS = clampInt(process.env.OPENAI_WS_BENCH_MAX_TURNS, 3, 1, 8);
const REQUEST_TIMEOUT_MS = clampInt(process.env.OPENAI_WS_BENCH_TIMEOUT_MS, 90_000, 10_000, 240_000);
const REQUEST_DELAY_MS = clampInt(process.env.OPENAI_WS_BENCH_DELAY_MS, 150, 0, 5_000);
const WS_CONNECT_TIMEOUT_MS = clampInt(process.env.OPENAI_WS_BENCH_CONNECT_TIMEOUT_MS, 20_000, 5_000, 60_000);

const TOOL_DEFS = [
	{
		type: "function",
		name: "lookup_weather",
		description: "Return current weather for a city.",
		parameters: {
			type: "object",
			properties: {
				city: { type: "string" },
				unit: { type: "string", enum: ["C", "F"] },
			},
			required: ["city"],
			additionalProperties: false,
		},
	},
	{
		type: "function",
		name: "lookup_calendar",
		description: "Return calendar events for a date.",
		parameters: {
			type: "object",
			properties: {
				date: { type: "string" },
				timezone: { type: "string" },
			},
			required: ["date"],
			additionalProperties: false,
		},
	},
	{
		type: "function",
		name: "lookup_exchange_rate",
		description: "Return exchange rate for a currency pair.",
		parameters: {
			type: "object",
			properties: {
				pair: { type: "string" },
			},
			required: ["pair"],
			additionalProperties: false,
		},
	},
] as const;

const MULTI_TOOL_PROMPT = [
	"Call all three tools before finalizing your answer.",
	"1) lookup_weather for San Francisco in F.",
	"2) lookup_calendar for 2026-03-01 in America/Los_Angeles.",
	"3) lookup_exchange_rate for USD/EUR.",
	"After tools return, produce exactly 3 concise bullets:",
	"- weather summary",
	"- one calendar highlight",
	"- exchange-rate implication for a traveler.",
].join("\n");

const describeBench = BENCH_RUN ? describe : describe.skip;

describeBench("Live benchmark: OpenAI direct WS vs Gateway WS tunnel", () => {
	it("compares latency on a multi-turn tool-calling workflow", async () => {
		if (!DIRECT_OPENAI_API_KEY) {
			throw new Error("OPENAI_API_KEY is required when OPENAI_WS_BENCH_RUN=1");
		}
		if (!GATEWAY_API_KEY) {
			throw new Error("GATEWAY_API_KEY (or PLAYGROUND_KEY) is required when OPENAI_WS_BENCH_RUN=1");
		}

		const runs: RunMetric[] = [];
		for (let i = 0; i < ITERATIONS; i += 1) {
			const order: ProviderTarget[] = i % 2 === 0
				? ["direct_openai_ws", "gateway_openai_ws"]
				: ["gateway_openai_ws", "direct_openai_ws"];
			for (const target of order) {
				const batch = await Promise.all(
					Array.from({ length: CONCURRENCY }, (_, worker) =>
						runConversationBenchmark(target, i + 1, worker + 1),
					),
				);
				runs.push(...batch);
				if (REQUEST_DELAY_MS > 0) {
					await sleep(REQUEST_DELAY_MS);
				}
			}
		}

		const direct = runs.filter((entry) => entry.provider === "direct_openai_ws");
		const gateway = runs.filter((entry) => entry.provider === "gateway_openai_ws");

		expect(direct).toHaveLength(ITERATIONS * CONCURRENCY);
		expect(gateway).toHaveLength(ITERATIONS * CONCURRENCY);
		expect(direct.every((entry) => entry.turns.length > 0)).toBe(true);
		expect(gateway.every((entry) => entry.turns.length > 0)).toBe(true);

		const directToolCallTurns = direct
			.flatMap((entry) => entry.turns)
			.filter((turn) => turn.toolCalls > 0)
			.length;
		const gatewayToolCallTurns = gateway
			.flatMap((entry) => entry.turns)
			.filter((turn) => turn.toolCalls > 0)
			.length;
		expect(directToolCallTurns).toBeGreaterThan(0);
		expect(gatewayToolCallTurns).toBeGreaterThan(0);

		const directTotalStats = summarize(direct.map((entry) => entry.totalMs));
		const gatewayTotalStats = summarize(gateway.map((entry) => entry.totalMs));
		const directFirstTtfbStats = summarize(direct.map((entry) => entry.firstTurnTtfbMs));
		const gatewayFirstTtfbStats = summarize(gateway.map((entry) => entry.firstTurnTtfbMs));
		if (!directTotalStats || !gatewayTotalStats || !directFirstTtfbStats || !gatewayFirstTtfbStats) {
			throw new Error("Benchmark summary could not be computed");
		}

		console.log("");
		console.log("OpenAI websocket benchmark summary");
		console.log(
			`iterations=${ITERATIONS} concurrency=${CONCURRENCY} maxTurns=${MAX_TURNS} model=${DIRECT_MODEL}`,
		);
		console.log(formatStatsLine("direct ws total", directTotalStats));
		console.log(formatStatsLine("gateway ws total", gatewayTotalStats));
		console.log(formatStatsLine("direct ws ttfb", directFirstTtfbStats));
		console.log(formatStatsLine("gateway ws ttfb", gatewayFirstTtfbStats));
		console.log(formatDeltaLine("delta total p50", directTotalStats.p50, gatewayTotalStats.p50));
		console.log(formatDeltaLine("delta total p95", directTotalStats.p95, gatewayTotalStats.p95));
		console.log(formatDeltaLine("delta ttfb p50", directFirstTtfbStats.p50, gatewayFirstTtfbStats.p50));
		console.log(formatDeltaLine("delta ttfb p95", directFirstTtfbStats.p95, gatewayFirstTtfbStats.p95));
		console.log("");
	}, 12 * 60_000);
});

async function runConversationBenchmark(provider: ProviderTarget, run: number, worker: number): Promise<RunMetric> {
	const ws = await connectProviderWebSocket(provider);
	const turns: TurnMetric[] = [];
	let finalResponseId: string | null = null;
	let previousResponseId: string | null = null;
	let pendingToolOutputs: Array<{ type: "function_call_output"; call_id: string; output: string }> = [];

	try {
		for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
			const payload: Record<string, unknown> = {
				type: "response.create",
				model: provider === "direct_openai_ws" ? DIRECT_MODEL : GATEWAY_MODEL,
				store: false,
				tools: TOOL_DEFS,
				tool_choice: "auto",
				input: pendingToolOutputs.length > 0
					? [
						...pendingToolOutputs,
						{
							type: "message",
							role: "user",
							content: [
								{
									type: "input_text",
									text: "Continue. If more tools are needed, call them. Otherwise finalize.",
								},
							],
						},
					]
					: `${MULTI_TOOL_PROMPT}\n\nbenchmark_run_id: ${provider}-${run}-u${worker}-t${turn}`,
			};
			if (previousResponseId) {
				payload.previous_response_id = previousResponseId;
			}

			const turnResult = await executeTurnOverWebSocket(ws, payload);
			const completedResponse = turnResult.completedResponse;
			if (!completedResponse || typeof completedResponse !== "object") {
				throw new Error(`[${provider}] missing completed response payload on turn ${turn}`);
			}

			const responseId = typeof completedResponse.id === "string" ? completedResponse.id : null;
			if (!responseId) {
				throw new Error(`[${provider}] missing response id on turn ${turn}`);
			}
			finalResponseId = responseId;
			previousResponseId = responseId;

			const toolCalls = extractToolCalls(completedResponse);
			pendingToolOutputs = toolCalls.map((call) => ({
				type: "function_call_output",
				call_id: call.callId,
				output: JSON.stringify({
					ok: true,
					tool: call.name,
					arguments: call.arguments,
					mock_result: mockToolResult(call),
				}),
			}));

			turns.push({
				turn,
				ttfbMs: turnResult.ttfbMs,
				totalMs: turnResult.totalMs,
				eventCount: turnResult.events.length,
				toolCalls: toolCalls.length,
			});

			if (toolCalls.length === 0) break;
		}
	} finally {
		await closeWebSocket(ws);
	}

	const totalMs = turns.reduce((sum, turn) => sum + turn.totalMs, 0);
	const firstTurnTtfbMs = turns[0]?.ttfbMs ?? 0;
	return {
		provider,
		run,
		turns,
		totalMs,
		firstTurnTtfbMs,
		finalResponseId,
	};
}

async function connectProviderWebSocket(provider: ProviderTarget): Promise<WebSocket> {
	const url = provider === "direct_openai_ws"
		? `${DIRECT_OPENAI_BASE_URL.replace(/^http/i, "ws")}/responses`
		: GATEWAY_WS_URL;
	const key = provider === "direct_openai_ws" ? DIRECT_OPENAI_API_KEY : GATEWAY_API_KEY;
	if (!key) {
		throw new Error(`[${provider}] missing API key`);
	}

	return await new Promise<WebSocket>((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			try {
				ws.close();
			} catch {
				// no-op
			}
			reject(new Error(`[${provider}] websocket connect timeout after ${WS_CONNECT_TIMEOUT_MS}ms`));
		}, WS_CONNECT_TIMEOUT_MS);

		const WebSocketCtor = WebSocket as any;
		const ws = new WebSocketCtor(url, [], {
			headers: {
				Authorization: `Bearer ${key}`,
			},
		}) as WebSocket;

		const finalize = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			fn();
		};

		ws.addEventListener("open", () => finalize(() => resolve(ws)));
		ws.addEventListener("error", () => finalize(() => reject(new Error(`[${provider}] websocket connect error`))));
		ws.addEventListener("close", (event: CloseEvent) => {
			if (settled) return;
			finalize(() => reject(new Error(`[${provider}] websocket closed during connect: ${event.code} ${event.reason || "no_reason"}`)));
		});
	});
}

async function executeTurnOverWebSocket(
	ws: WebSocket,
	payload: Record<string, unknown>,
): Promise<WsTurnResult> {
	if (ws.readyState !== WebSocket.OPEN) {
		throw new Error(`websocket is not open (readyState=${ws.readyState})`);
	}

	const startedAt = performance.now();
	let sawFirstMessage = false;
	let ttfbMs = 0;
	const events: ParsedWsEvent[] = [];
	let completedResponse: any | null = null;

	return await new Promise<WsTurnResult>((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			if (settled) return;
			settled = true;
			cleanup();
			reject(new Error(`turn timed out after ${REQUEST_TIMEOUT_MS}ms`));
		}, REQUEST_TIMEOUT_MS);

		const finish = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			cleanup();
			fn();
		};

		const onMessage = async (event: MessageEvent) => {
			const text = await decodeMessageText(event.data);
			if (!text) return;
			if (!sawFirstMessage) {
				sawFirstMessage = true;
				ttfbMs = performance.now() - startedAt;
			}
			let parsed: unknown = text;
			try {
				parsed = JSON.parse(text);
			} catch {
				// Keep raw text.
			}
			events.push({ raw: text, data: parsed });

			const payloadLike = parsed as any;
			const type = typeof payloadLike?.type === "string" ? payloadLike.type : "";
			if (type === "response.completed" && payloadLike.response) {
				completedResponse = payloadLike.response;
				const totalMs = performance.now() - startedAt;
				finish(() => resolve({
					ttfbMs: sawFirstMessage ? ttfbMs : totalMs,
					totalMs,
					events,
					completedResponse,
				}));
				return;
			}
			if (type === "response.failed") {
				finish(() => reject(new Error(`response.failed: ${text.slice(0, 400)}`)));
				return;
			}
			if (type === "error") {
				finish(() => reject(new Error(`error event: ${text.slice(0, 400)}`)));
			}
		};

		const onError = () => {
			finish(() => reject(new Error("websocket error during turn")));
		};

		const onClose = (event: CloseEvent) => {
			finish(() => reject(new Error(`websocket closed during turn: ${event.code} ${event.reason || "no_reason"}`)));
		};

		const cleanup = () => {
			ws.removeEventListener("message", onMessage as EventListener);
			ws.removeEventListener("error", onError as EventListener);
			ws.removeEventListener("close", onClose as EventListener);
		};

		ws.addEventListener("message", onMessage as EventListener);
		ws.addEventListener("error", onError as EventListener);
		ws.addEventListener("close", onClose as EventListener);

		try {
			ws.send(JSON.stringify(payload));
		} catch (error: any) {
			finish(() => reject(new Error(`send failed: ${String(error?.message ?? error)}`)));
		}
	});
}

async function decodeMessageText(data: unknown): Promise<string | null> {
	if (typeof data === "string") return data;
	if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data));
	if (ArrayBuffer.isView(data)) {
		return new TextDecoder().decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
	}
	if (typeof Blob !== "undefined" && data instanceof Blob) {
		return await data.text();
	}
	return null;
}

async function closeWebSocket(ws: WebSocket): Promise<void> {
	if (ws.readyState === WebSocket.CLOSED) return;
	await new Promise<void>((resolve) => {
		let done = false;
		const finish = () => {
			if (done) return;
			done = true;
			resolve();
		};
		const timeout = setTimeout(finish, 2_000);
		ws.addEventListener("close", () => {
			clearTimeout(timeout);
			finish();
		}, { once: true });
		try {
			ws.close(1000, "benchmark_complete");
		} catch {
			clearTimeout(timeout);
			finish();
		}
	});
}

function extractToolCalls(response: any): ToolCall[] {
	const output = Array.isArray(response?.output) ? response.output : [];
	const calls: ToolCall[] = [];
	for (const item of output) {
		if (!item || typeof item !== "object") continue;
		if (item.type !== "function_call") continue;
		const name = typeof item.name === "string" ? item.name : "";
		const callId = typeof item.call_id === "string"
			? item.call_id
			: (typeof item.id === "string" ? item.id : "");
		const args = typeof item.arguments === "string" ? item.arguments : "{}";
		if (!name || !callId) continue;
		calls.push({ name, callId, arguments: args });
	}
	return calls;
}

function mockToolResult(call: ToolCall): Record<string, unknown> {
	switch (call.name) {
		case "lookup_weather":
			return { city: "San Francisco", unit: "F", temperature: 64, condition: "Partly Cloudy" };
		case "lookup_calendar":
			return { date: "2026-03-01", timezone: "America/Los_Angeles", highlight: "Product planning sync at 10:00" };
		case "lookup_exchange_rate":
			return { pair: "USD/EUR", rate: 0.92 };
		default:
			return { name: call.name, ok: true };
	}
}

function summarize(values: number[]): SummaryStats | null {
	const finite = values.filter((value) => Number.isFinite(value));
	if (finite.length === 0) return null;
	const sorted = [...finite].sort((a, b) => a - b);
	const sum = sorted.reduce((acc, value) => acc + value, 0);
	return {
		p50: percentile(sorted, 50),
		p95: percentile(sorted, 95),
		mean: sum / sorted.length,
		min: sorted[0],
		max: sorted[sorted.length - 1],
	};
}

function percentile(sorted: number[], p: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const rank = (p / 100) * (sorted.length - 1);
	const low = Math.floor(rank);
	const high = Math.ceil(rank);
	if (low === high) return sorted[low];
	const weight = rank - low;
	return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function formatStatsLine(label: string, stats: SummaryStats): string {
	return [
		`${label}:`,
		`p50=${stats.p50.toFixed(1)}ms`,
		`p95=${stats.p95.toFixed(1)}ms`,
		`mean=${stats.mean.toFixed(1)}ms`,
		`min=${stats.min.toFixed(1)}ms`,
		`max=${stats.max.toFixed(1)}ms`,
	].join(" ");
}

function formatDeltaLine(label: string, baseline: number, candidate: number): string {
	const deltaMs = candidate - baseline;
	const deltaPct = baseline > 0 ? (deltaMs / baseline) * 100 : 0;
	return `${label}: gateway-baseline=${deltaMs.toFixed(1)}ms (${deltaPct.toFixed(1)}%)`;
}

function normalizeOpenAIBaseUrl(value: string): string {
	const base = value.trim().replace(/\/+$/, "");
	if (!base) return "https://api.openai.com/v1";
	if (base.endsWith("/v1")) return base;
	return `${base}/v1`;
}

function normalizeGatewayBaseUrl(value: string): string {
	return value.trim().replace(/\/+$/, "");
}

function normalizeGatewayWebSocketUrl(explicitValue: string | undefined, gatewayHttpBaseUrl: string): string {
	const explicit = (explicitValue ?? "").trim();
	if (explicit) return explicit.replace(/\/+$/, "");
	const asWs = gatewayHttpBaseUrl.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
	if (asWs.endsWith("/responses/ws")) return asWs;
	return `${asWs}/responses/ws`;
}

function normalizeModelName(value: string): string {
	const model = value.trim().replace(/^openai\//, "");
	if (!model) return "gpt-5-nano";
	return model;
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
	const parsed = Number(value ?? "");
	if (!Number.isFinite(parsed)) return fallback;
	const rounded = Math.round(parsed);
	return Math.max(min, Math.min(max, rounded));
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
