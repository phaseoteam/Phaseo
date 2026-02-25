import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

type ProviderTarget = "gateway_openai_http" | "gateway_openai_ws";

type ParsedSseEvent = {
	raw: string;
	data: unknown;
};

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
	totalToolCalls: number;
};

type SummaryStats = {
	p50: number;
	p95: number;
	mean: number;
	min: number;
	max: number;
};

type WsTurnResult = {
	ttfbMs: number;
	totalMs: number;
	events: ParsedWsEvent[];
	completedResponse: any;
};

type HttpTurnResult = {
	ttfbMs: number;
	totalMs: number;
	events: ParsedSseEvent[];
	completedResponse: any | null;
};

type BenchmarkToolDef = {
	type: "function";
	name: string;
	description: string;
	parameters: {
		type: "object";
		properties: Record<string, any>;
		required: string[];
		additionalProperties: false;
	};
};

type BuildTurnInputArgs = {
	benchmarkId: string;
	turn: number;
	forcedToolName: string | null;
};

const BENCH_RUN = (process.env.GATEWAY_WS_BENCH_RUN ?? process.env.OPENAI_WS_BENCH_RUN ?? "").trim() === "1";
const GATEWAY_HTTP_BASE_URL = normalizeGatewayBaseUrl(process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1");
const GATEWAY_WS_URL = normalizeGatewayWebSocketUrl(
	process.env.GATEWAY_WS_URL,
	GATEWAY_HTTP_BASE_URL,
);
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const MODEL = normalizeModelName(
	process.env.GATEWAY_WS_BENCH_MODEL ?? process.env.OPENAI_WS_BENCH_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-5-nano",
);
const GATEWAY_MODEL = `openai/${MODEL}`;

const ITERATIONS = clampInt(process.env.GATEWAY_WS_BENCH_ITERS ?? process.env.OPENAI_WS_BENCH_ITERS, 4, 1, 20);
const CONCURRENCY = clampInt(process.env.GATEWAY_WS_BENCH_CONCURRENCY ?? process.env.OPENAI_WS_BENCH_CONCURRENCY, 1, 1, 20);
const TOOL_CALL_TARGET = clampInt(
	process.env.GATEWAY_WS_BENCH_TOOL_CALL_TARGET ?? process.env.OPENAI_WS_BENCH_TOOL_CALL_TARGET,
	10,
	1,
	30,
);
const MAX_TURNS = clampInt(
	process.env.GATEWAY_WS_BENCH_MAX_TURNS ?? process.env.OPENAI_WS_BENCH_MAX_TURNS,
	Math.max(TOOL_CALL_TARGET + 2, 12),
	TOOL_CALL_TARGET + 1,
	40,
);
const REQUEST_TIMEOUT_MS = clampInt(process.env.GATEWAY_WS_BENCH_TIMEOUT_MS ?? process.env.OPENAI_WS_BENCH_TIMEOUT_MS, 90_000, 10_000, 240_000);
const REQUEST_DELAY_MS = clampInt(process.env.GATEWAY_WS_BENCH_DELAY_MS ?? process.env.OPENAI_WS_BENCH_DELAY_MS, 150, 0, 5_000);
const WS_CONNECT_TIMEOUT_MS = clampInt(process.env.GATEWAY_WS_BENCH_CONNECT_TIMEOUT_MS ?? process.env.OPENAI_WS_BENCH_CONNECT_TIMEOUT_MS, 20_000, 5_000, 60_000);

const TOOL_DEFS = buildToolDefs(TOOL_CALL_TARGET);
const FORCED_TOOL_NAMES = TOOL_DEFS.map((tool) => tool.name);

const MULTI_TOOL_PROMPT = [
	`You are running a benchmark with ${TOOL_CALL_TARGET} required function calls.`,
	"Do not answer in natural language while tool calls are still required.",
	"For each turn, call exactly the function name requested by the user.",
	"Once all required function calls are complete, provide a concise final summary in 3 bullets.",
].join("\n");

const describeBench = BENCH_RUN ? describe : describe.skip;

describeBench("Live benchmark: Gateway OpenAI HTTP vs Gateway OpenAI WS", () => {
	it("compares latency for gpt-5-nano on multi-turn tool flow", async () => {
		if (!GATEWAY_API_KEY) {
			throw new Error("GATEWAY_API_KEY (or PLAYGROUND_KEY) is required when GATEWAY_WS_BENCH_RUN=1");
		}

		const runs: RunMetric[] = [];
		for (let i = 0; i < ITERATIONS; i += 1) {
			const order: ProviderTarget[] = i % 2 === 0
				? ["gateway_openai_http", "gateway_openai_ws"]
				: ["gateway_openai_ws", "gateway_openai_http"];
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

		const http = runs.filter((entry) => entry.provider === "gateway_openai_http");
		const ws = runs.filter((entry) => entry.provider === "gateway_openai_ws");

		expect(http).toHaveLength(ITERATIONS * CONCURRENCY);
		expect(ws).toHaveLength(ITERATIONS * CONCURRENCY);
		expect(http.every((entry) => entry.turns.length > 0)).toBe(true);
		expect(ws.every((entry) => entry.turns.length > 0)).toBe(true);

		const httpToolCallTurns = http
			.flatMap((entry) => entry.turns)
			.filter((turn) => turn.toolCalls > 0)
			.length;
		const wsToolCallTurns = ws
			.flatMap((entry) => entry.turns)
			.filter((turn) => turn.toolCalls > 0)
			.length;
		expect(httpToolCallTurns).toBeGreaterThan(0);
		expect(wsToolCallTurns).toBeGreaterThan(0);

		const httpTotalStats = summarize(http.map((entry) => entry.totalMs));
		const wsTotalStats = summarize(ws.map((entry) => entry.totalMs));
		const httpFirstTtfbStats = summarize(http.map((entry) => entry.firstTurnTtfbMs));
		const wsFirstTtfbStats = summarize(ws.map((entry) => entry.firstTurnTtfbMs));
		if (!httpTotalStats || !wsTotalStats || !httpFirstTtfbStats || !wsFirstTtfbStats) {
			throw new Error("Benchmark summary could not be computed");
		}

		console.log("");
		console.log("Gateway OpenAI HTTP vs WS benchmark summary");
		console.log(
			`iterations=${ITERATIONS} concurrency=${CONCURRENCY} maxTurns=${MAX_TURNS} ` +
			`toolCallTarget=${TOOL_CALL_TARGET} model=${GATEWAY_MODEL}`,
		);
		console.log(formatStatsLine("gateway http total", httpTotalStats));
		console.log(formatStatsLine("gateway ws total", wsTotalStats));
		console.log(formatStatsLine("gateway http ttfb", httpFirstTtfbStats));
		console.log(formatStatsLine("gateway ws ttfb", wsFirstTtfbStats));
		console.log(formatDeltaLine("delta total p50", httpTotalStats.p50, wsTotalStats.p50));
		console.log(formatDeltaLine("delta total p95", httpTotalStats.p95, wsTotalStats.p95));
		console.log(formatDeltaLine("delta ttfb p50", httpFirstTtfbStats.p50, wsFirstTtfbStats.p50));
		console.log(formatDeltaLine("delta ttfb p95", httpFirstTtfbStats.p95, wsFirstTtfbStats.p95));
		console.log(
			`tool_calls: http_mean=${average(http.map((entry) => entry.totalToolCalls)).toFixed(1)} ` +
			`ws_mean=${average(ws.map((entry) => entry.totalToolCalls)).toFixed(1)}`,
		);
		console.log("");

		expect(http.every((entry) => entry.totalToolCalls >= TOOL_CALL_TARGET)).toBe(true);
		expect(ws.every((entry) => entry.totalToolCalls >= TOOL_CALL_TARGET)).toBe(true);
	}, 12 * 60_000);
});

async function runConversationBenchmark(provider: ProviderTarget, run: number, worker: number): Promise<RunMetric> {
	if (provider === "gateway_openai_http") {
		return runGatewayHttpConversation(run, worker);
	}
	return runGatewayWsConversation(run, worker);
}

async function runGatewayHttpConversation(run: number, worker: number): Promise<RunMetric> {
	const turns: TurnMetric[] = [];
	let finalResponseId: string | null = null;
	let totalToolCalls = 0;
	let forcedToolIndex = 0;

	for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
		const forcedToolName = FORCED_TOOL_NAMES[forcedToolIndex] ?? null;
		const body: Record<string, unknown> = {
			model: GATEWAY_MODEL,
			stream: true,
			store: false,
			tools: TOOL_DEFS,
			tool_choice: forcedToolName ? { type: "function", name: forcedToolName } : "auto",
			input: buildTurnInput({
				benchmarkId: `gateway_openai_http-${run}-u${worker}-t${turn}`,
				turn,
				forcedToolName,
			}),
		};
		const streamResult = await postGatewayResponsesStream(body);
		const completedLike = streamResult.completedResponse && typeof streamResult.completedResponse === "object"
			? streamResult.completedResponse
			: null;
		const responseId = completedLike && typeof completedLike.id === "string" ? completedLike.id : null;
		if (responseId) {
			finalResponseId = responseId;
		}
		const toolCalls = completedLike ? extractToolCalls(completedLike) : [];
		totalToolCalls += toolCalls.length;
		if (forcedToolName) {
			const calledForcedTool = toolCalls.some((call) => call.name === forcedToolName);
			if (!calledForcedTool) {
				throw new Error(
					`[gateway_openai_http] expected forced tool ${forcedToolName} on turn ${turn}, ` +
					`observed=${toolCalls.map((call) => call.name).join(",") || "none"}`,
				);
			}
			forcedToolIndex += 1;
		}
		turns.push({
			turn,
			ttfbMs: streamResult.ttfbMs,
			totalMs: streamResult.totalMs,
			eventCount: streamResult.events.length,
			toolCalls: toolCalls.length,
		});
		if (!forcedToolName && toolCalls.length === 0) break;
	}

	const totalMs = turns.reduce((sum, turn) => sum + turn.totalMs, 0);
	const firstTurnTtfbMs = turns[0]?.ttfbMs ?? 0;
	return {
		provider: "gateway_openai_http",
		run,
		turns,
		totalMs,
		firstTurnTtfbMs,
		finalResponseId,
		totalToolCalls,
	};
}

async function runGatewayWsConversation(run: number, worker: number): Promise<RunMetric> {
	const ws = await connectGatewayWebSocket();
	const turns: TurnMetric[] = [];
	let finalResponseId: string | null = null;
	let totalToolCalls = 0;
	let forcedToolIndex = 0;

	try {
		for (let turn = 1; turn <= MAX_TURNS; turn += 1) {
			const forcedToolName = FORCED_TOOL_NAMES[forcedToolIndex] ?? null;
			const payload: Record<string, unknown> = {
				type: "response.create",
				model: GATEWAY_MODEL,
				store: false,
				tools: TOOL_DEFS,
				tool_choice: forcedToolName ? { type: "function", name: forcedToolName } : "auto",
				input: buildTurnInput({
					benchmarkId: `gateway_openai_ws-${run}-u${worker}-t${turn}`,
					turn,
					forcedToolName,
				}),
			};

			const turnResult = await executeTurnOverWebSocket(ws, payload);
			const completedResponse = turnResult.completedResponse;
			if (!completedResponse || typeof completedResponse !== "object") {
				throw new Error(`[gateway_openai_ws] missing completed response payload on turn ${turn}`);
			}
			const responseId = typeof completedResponse.id === "string" ? completedResponse.id : null;
			if (!responseId) {
				throw new Error(`[gateway_openai_ws] missing response id on turn ${turn}`);
			}
			finalResponseId = responseId;

			const toolCalls = extractToolCalls(completedResponse);
			totalToolCalls += toolCalls.length;
			if (forcedToolName) {
				const calledForcedTool = toolCalls.some((call) => call.name === forcedToolName);
				if (!calledForcedTool) {
					throw new Error(
						`[gateway_openai_ws] expected forced tool ${forcedToolName} on turn ${turn}, ` +
						`observed=${toolCalls.map((call) => call.name).join(",") || "none"}`,
					);
				}
				forcedToolIndex += 1;
			}
			turns.push({
				turn,
				ttfbMs: turnResult.ttfbMs,
				totalMs: turnResult.totalMs,
				eventCount: turnResult.events.length,
				toolCalls: toolCalls.length,
			});
			if (!forcedToolName && toolCalls.length === 0) break;
		}
	} finally {
		await closeWebSocket(ws);
	}

	const totalMs = turns.reduce((sum, turn) => sum + turn.totalMs, 0);
	const firstTurnTtfbMs = turns[0]?.ttfbMs ?? 0;
	return {
		provider: "gateway_openai_ws",
		run,
		turns,
		totalMs,
		firstTurnTtfbMs,
		finalResponseId,
		totalToolCalls,
	};
}

async function postGatewayResponsesStream(body: Record<string, unknown>): Promise<HttpTurnResult> {
	const startedAt = performance.now();
	const res = await fetch(`${GATEWAY_HTTP_BASE_URL}/responses`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${GATEWAY_API_KEY}`,
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`[gateway_openai_http] ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
	}
	const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
	if (!contentType.includes("text/event-stream")) {
		const payload = await res.json().catch(async () => {
			const raw = await res.text().catch(() => "");
			throw new Error(`[gateway_openai_http] invalid json response: ${raw.slice(0, 400)}`);
		});
		const totalMs = performance.now() - startedAt;
		return {
			ttfbMs: totalMs,
			totalMs,
			events: [{ raw: JSON.stringify(payload), data: payload }],
			completedResponse: payload && typeof payload === "object" ? payload : null,
		};
	}

	if (!res.body) {
		throw new Error("[gateway_openai_http] response body is missing");
	}

	let ttfbMs = 0;
	let sawFirstChunk = false;
	const events: ParsedSseEvent[] = [];
	let completedResponse: any | null = null;
	let buffer = "";

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (!sawFirstChunk) {
			sawFirstChunk = true;
			ttfbMs = performance.now() - startedAt;
		}
		buffer += decoder.decode(value, { stream: true });
		const parsed = drainSseBuffer(buffer);
		buffer = parsed.remaining;
		for (const event of parsed.events) {
			events.push(event);
			const payload = event.data as any;
			if (payload && typeof payload === "object" && payload.type === "response.completed" && payload.response) {
				completedResponse = payload.response;
			}
		}
	}

	if (buffer.trim()) {
		const parsed = drainSseBuffer(`${buffer}\n\n`);
		for (const event of parsed.events) {
			events.push(event);
			const payload = event.data as any;
			if (payload && typeof payload === "object" && payload.type === "response.completed" && payload.response) {
				completedResponse = payload.response;
			}
		}
	}

	const totalMs = performance.now() - startedAt;
	return {
		ttfbMs: sawFirstChunk ? ttfbMs : totalMs,
		totalMs,
		events,
		completedResponse,
	};
}

async function connectGatewayWebSocket(): Promise<WebSocket> {
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
			reject(new Error(`[gateway_openai_ws] websocket connect timeout after ${WS_CONNECT_TIMEOUT_MS}ms`));
		}, WS_CONNECT_TIMEOUT_MS);

		const WebSocketCtor = WebSocket as any;
		const ws = new WebSocketCtor(GATEWAY_WS_URL, {
			headers: {
				Authorization: `Bearer ${GATEWAY_API_KEY}`,
			},
		}) as WebSocket;

		const finalize = (fn: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			fn();
		};

		ws.addEventListener("open", () => finalize(() => resolve(ws)));
		ws.addEventListener("error", () => finalize(() => reject(new Error("[gateway_openai_ws] websocket connect error"))));
		ws.addEventListener("close", (event: CloseEvent) => {
			if (settled) return;
			finalize(() => reject(new Error(`[gateway_openai_ws] websocket closed during connect: ${event.code} ${event.reason || "no_reason"}`)));
		});
	});
}

async function executeTurnOverWebSocket(
	ws: WebSocket,
	payload: Record<string, unknown>,
): Promise<WsTurnResult> {
	if (ws.readyState !== WebSocket.OPEN) {
		throw new Error(`[gateway_openai_ws] websocket is not open (readyState=${ws.readyState})`);
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
			reject(new Error(`[gateway_openai_ws] turn timed out after ${REQUEST_TIMEOUT_MS}ms`));
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
				// keep raw
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
				finish(() => reject(new Error(`[gateway_openai_ws] response.failed: ${text.slice(0, 400)}`)));
				return;
			}
			if (type === "error") {
				finish(() => reject(new Error(`[gateway_openai_ws] error event: ${text.slice(0, 400)}`)));
			}
		};

		const onError = () => {
			finish(() => reject(new Error("[gateway_openai_ws] websocket error during turn")));
		};

		const onClose = (event: CloseEvent) => {
			finish(() => reject(new Error(`[gateway_openai_ws] websocket closed during turn: ${event.code} ${event.reason || "no_reason"}`)));
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
			finish(() => reject(new Error(`[gateway_openai_ws] send failed: ${String(error?.message ?? error)}`)));
		}
	});
}

function drainSseBuffer(buffer: string): { events: ParsedSseEvent[]; remaining: string } {
	const parts = buffer.split(/\r?\n\r?\n/);
	const remaining = parts.pop() ?? "";
	const events: ParsedSseEvent[] = [];
	for (const rawPart of parts) {
		const raw = rawPart.trim();
		if (!raw) continue;
		const dataLines: string[] = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.replace(/\r$/, "");
			if (trimmed.startsWith("data:")) {
				dataLines.push(trimmed.slice(5).trimStart());
			}
		}
		if (dataLines.length === 0) continue;
		const merged = dataLines.join("");
		if (merged === "[DONE]") continue;
		try {
			events.push({ raw, data: JSON.parse(merged) });
		} catch {
			events.push({ raw, data: merged });
		}
	}
	return { events, remaining };
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

function buildToolDefs(toolCount: number): BenchmarkToolDef[] {
	const defs: BenchmarkToolDef[] = [];
	for (let i = 1; i <= toolCount; i += 1) {
		const step = String(i).padStart(2, "0");
		defs.push({
			type: "function",
			name: `lookup_step_${step}`,
			description: `Return benchmark payload for step ${step}.`,
			parameters: {
				type: "object",
				properties: {
					step: { type: "integer" },
					benchmark_id: { type: "string" },
				},
				required: ["step", "benchmark_id"],
				additionalProperties: false,
			},
		});
	}
	return defs;
}

function buildTurnInput(args: BuildTurnInputArgs): string {
	const { benchmarkId, turn, forcedToolName } = args;
	const requestLine = forcedToolName
		? `Now call exactly one tool: ${forcedToolName}. Do not answer yet.`
		: "All required tools are complete. Return a concise final answer in exactly 3 bullets.";
	return `${MULTI_TOOL_PROMPT}\n\n${requestLine}\nturn=${turn}\nbenchmark_run_id: ${benchmarkId}`;
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

function average(values: number[]): number {
	if (values.length === 0) return 0;
	const total = values.reduce((sum, value) => sum + value, 0);
	return total / values.length;
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
	return `${label}: ws-baseline=${deltaMs.toFixed(1)}ms (${deltaPct.toFixed(1)}%)`;
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
