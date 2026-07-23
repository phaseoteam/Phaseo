type PerfEnv = {
	PERF_UPSTREAM_TOKEN?: string;
	PERF_MAX_REQUEST_BYTES?: string;
	PERF_MAX_FIRST_FRAME_MS?: string;
	PERF_MAX_FRAME_INTERVAL_MS?: string;
	PERF_MAX_FRAMES?: string;
};

type Scenario = {
	name: string;
	status: number;
	firstFrameMs: number;
	frameIntervalMs: number;
	frames: number;
	truncate: boolean;
	failureRate: number;
};

const encoder = new TextEncoder();

const PRESETS: Record<string, Scenario> = {
	fast: { name: "fast", status: 200, firstFrameMs: 0, frameIntervalMs: 0, frames: 3, truncate: false, failureRate: 0 },
	realistic: { name: "realistic", status: 200, firstFrameMs: 25, frameIntervalMs: 8, frames: 8, truncate: false, failureRate: 0 },
	"slow-first-frame": { name: "slow-first-frame", status: 200, firstFrameMs: 250, frameIntervalMs: 5, frames: 4, truncate: false, failureRate: 0 },
	"rate-limit": { name: "rate-limit", status: 429, firstFrameMs: 5, frameIntervalMs: 0, frames: 0, truncate: false, failureRate: 0 },
	unavailable: { name: "unavailable", status: 503, firstFrameMs: 5, frameIntervalMs: 0, frames: 0, truncate: false, failureRate: 0 },
	truncated: { name: "truncated", status: 200, firstFrameMs: 5, frameIntervalMs: 2, frames: 2, truncate: true, failureRate: 0 },
	"flaky-25": { name: "flaky-25", status: 200, firstFrameMs: 5, frameIntervalMs: 2, frames: 4, truncate: false, failureRate: 25 },
};

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
	if (value === undefined) return fallback;
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(0, Math.min(maximum, parsed));
}

function configuredLimit(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function scenarioNameFromPath(pathname: string): string {
	const match = pathname.match(/(?:^|\/)scenarios\/([^/]+)/i);
	return match?.[1]?.toLowerCase() ?? "fast";
}

export function resolveScenario(request: Request, env: PerfEnv): Scenario {
	const name = scenarioNameFromPath(new URL(request.url).pathname);
	const preset = PRESETS[name] ?? PRESETS.fast;
	const controls = new Map<string, string>();
	const testId = request.headers.get("x-test-id") ?? "";
	if (testId.startsWith("perf:")) {
		for (const entry of testId.slice(5).split(";")) {
			const [key, value] = entry.split("=", 2);
			if (key && value !== undefined) controls.set(key.trim().toLowerCase(), value.trim());
		}
	}

	return {
		name,
		status: boundedInteger(controls.get("status"), preset.status, 599) || 200,
		firstFrameMs: boundedInteger(
			controls.get("first"),
			preset.firstFrameMs,
			configuredLimit(env.PERF_MAX_FIRST_FRAME_MS, 5000),
		),
		frameIntervalMs: boundedInteger(
			controls.get("interval"),
			preset.frameIntervalMs,
			configuredLimit(env.PERF_MAX_FRAME_INTERVAL_MS, 1000),
		),
		frames: boundedInteger(
			controls.get("frames"),
			preset.frames,
			configuredLimit(env.PERF_MAX_FRAMES, 100),
		),
		truncate: controls.get("truncate") === "1" || (controls.get("truncate") === undefined && preset.truncate),
		failureRate: boundedInteger(controls.get("failure"), preset.failureRate, 100),
	};
}

function sleep(ms: number): Promise<void> {
	return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function hashPercent(value: string): number {
	let hash = 2166136261;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0) % 100;
}

async function secureEqual(provided: string, expected: string): Promise<boolean> {
	const [left, right] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(provided)),
		crypto.subtle.digest("SHA-256", encoder.encode(expected)),
	]);
	const subtle = crypto.subtle as SubtleCrypto & {
		timingSafeEqual?: (left: ArrayBuffer, right: ArrayBuffer) => boolean;
	};
	if (subtle.timingSafeEqual) return subtle.timingSafeEqual(left, right);

	const leftBytes = new Uint8Array(left);
	const rightBytes = new Uint8Array(right);
	let difference = 0;
	for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
	return difference === 0;
}

async function isAuthorized(request: Request, env: PerfEnv): Promise<boolean> {
	const expected = env.PERF_UPSTREAM_TOKEN?.trim();
	if (!expected) return false;
	const authorization = request.headers.get("authorization") ?? "";
	const provided = authorization.replace(/^Bearer\s+/i, "");
	return secureEqual(provided, expected);
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<Record<string, unknown>> {
	const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
	if (Number.isFinite(contentLength) && contentLength > maximumBytes) throw new RangeError("request_too_large");
	if (!request.body) return {};

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		if (!value) continue;
		total += value.byteLength;
		if (total > maximumBytes) {
			await reader.cancel("request_too_large");
			throw new RangeError("request_too_large");
		}
		chunks.push(value);
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

function errorResponse(status: number, scenario: Scenario, requestId: string): Response {
	const headers = new Headers({
		"Cache-Control": "no-store",
		"X-Request-Id": requestId,
		"X-Phaseo-Perf-Scenario": scenario.name,
	});
	if (status === 429) headers.set("Retry-After", "1");
	return Response.json({
		error: {
			message: `Synthetic ${status} response from ${scenario.name}`,
			type: status === 429 ? "rate_limit_error" : "upstream_error",
			code: `phaseo_perf_${status}`,
		},
	}, {
		status,
		headers,
	});
}

function sseFrame(data: unknown, event?: string): Uint8Array {
	const prefix = event ? `event: ${event}\n` : "";
	return encoder.encode(`${prefix}data: ${JSON.stringify(data)}\n\n`);
}

function chatChunk(args: { requestId: string; model: string; index: number; done: boolean; frames: number }): object {
	return {
		id: args.requestId,
		object: "chat.completion.chunk",
		created: Math.floor(Date.now() / 1000),
		model: args.model,
		choices: [{
			index: 0,
			delta: args.done ? {} : { content: args.index === 0 ? "Synthetic" : " response" },
			finish_reason: args.done ? "stop" : null,
		}],
		usage: args.done ? { prompt_tokens: 4, completion_tokens: args.frames, total_tokens: 4 + args.frames } : null,
	};
}

function responseEvent(args: { requestId: string; model: string; index: number; done: boolean; frames: number }): { event: string; data: object } {
	if (args.done) {
		return {
			event: "response.completed",
			data: {
				type: "response.completed",
				response: {
					id: args.requestId,
					object: "response",
					status: "completed",
					model: args.model,
					output: [],
					usage: { input_tokens: 4, output_tokens: args.frames, total_tokens: 4 + args.frames },
				},
			},
		};
	}
	return {
		event: "response.output_text.delta",
		data: {
			type: "response.output_text.delta",
			item_id: "msg_perf",
			output_index: 0,
			content_index: 0,
			delta: args.index === 0 ? "Synthetic" : " response",
		},
	};
}

async function writeStream(args: {
	writable: WritableStream<Uint8Array>;
	scenario: Scenario;
	requestId: string;
	model: string;
	responsesProtocol: boolean;
}): Promise<void> {
	const writer = args.writable.getWriter();
	try {
		await sleep(args.scenario.firstFrameMs);
		for (let index = 0; index < args.scenario.frames; index += 1) {
			if (index > 0) await sleep(args.scenario.frameIntervalMs);
			if (args.responsesProtocol) {
				const frame = responseEvent({ ...args, index, done: false, frames: args.scenario.frames });
				await writer.write(sseFrame(frame.data, frame.event));
			} else {
				await writer.write(sseFrame(chatChunk({ ...args, index, done: false, frames: args.scenario.frames })));
			}
		}

		if (!args.scenario.truncate) {
			if (args.scenario.frames > 0) await sleep(args.scenario.frameIntervalMs);
			if (args.responsesProtocol) {
				const frame = responseEvent({ ...args, index: args.scenario.frames, done: true, frames: args.scenario.frames });
				await writer.write(sseFrame(frame.data, frame.event));
			} else {
				await writer.write(sseFrame(chatChunk({ ...args, index: args.scenario.frames, done: true, frames: args.scenario.frames })));
				await writer.write(encoder.encode("data: [DONE]\n\n"));
			}
		}
	} finally {
		await writer.close();
	}
}

async function handleInference(request: Request, env: PerfEnv, ctx: ExecutionContext): Promise<Response> {
	if (!(await isAuthorized(request, env))) {
		return Response.json({ error: { message: "Unauthorized", type: "authentication_error" } }, { status: 401 });
	}

	let body: Record<string, unknown>;
	try {
		body = await readBoundedJson(request, configuredLimit(env.PERF_MAX_REQUEST_BYTES, 65_536));
	} catch (error) {
		if (error instanceof RangeError) {
			return Response.json({ error: { message: "Request body too large", type: "invalid_request_error" } }, { status: 413 });
		}
		return Response.json({ error: { message: "Invalid JSON", type: "invalid_request_error" } }, { status: 400 });
	}

	const scenario = resolveScenario(request, env);
	const requestId = `perf_${crypto.randomUUID()}`;
	const stableRequestId = request.headers.get("idempotency-key") ?? request.headers.get("x-test-id") ?? requestId;
	if (scenario.failureRate > 0 && hashPercent(stableRequestId) < scenario.failureRate) scenario.status = 503;

	if (scenario.status < 200 || scenario.status >= 300) {
		await sleep(scenario.firstFrameMs);
		return errorResponse(scenario.status, scenario, requestId);
	}

	const url = new URL(request.url);
	const responsesProtocol = url.pathname.endsWith("/responses");
	const chatProtocol = url.pathname.endsWith("/chat/completions");
	if (!responsesProtocol && !chatProtocol) {
		return Response.json({ error: { message: "Unsupported synthetic endpoint" } }, { status: 404 });
	}

	const model = typeof body.model === "string" ? body.model : "phaseo-perf";
	const stream = new TransformStream<Uint8Array, Uint8Array>();
	ctx.waitUntil(writeStream({ writable: stream.writable, scenario, requestId, model, responsesProtocol }));

	return new Response(stream.readable, {
		status: 200,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "text/event-stream; charset=utf-8",
			"X-Accel-Buffering": "no",
			"X-Request-Id": requestId,
			"X-Phaseo-Perf-Scenario": scenario.name,
			"X-Phaseo-Perf-Received-At": String(Date.now()),
		},
	});
}

export default {
	async fetch(request: Request, env: PerfEnv, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "GET" && url.pathname === "/health") {
			return Response.json({ ok: true, service: "phaseo-perf-upstream" }, {
				headers: { "Cache-Control": "no-store" },
			});
		}
		if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
		return handleInference(request, env, ctx);
	},
} satisfies ExportedHandler<PerfEnv>;
