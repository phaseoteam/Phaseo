import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseSseFrames, readSseFrames, type ParsedSseFrame } from "../helpers/sse";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

type Endpoint = "/chat/completions" | "/responses" | "/messages";

type Scenario = {
	id: string;
	endpoint: Endpoint;
	stream: boolean;
	buildBody: (model: string) => Record<string, unknown>;
	validateJson?: (json: any) => void;
	validateStream?: (frames: ParsedSseFrame[]) => void;
};

type ScenarioOutcome =
	| { status: "passed"; details?: Record<string, unknown> }
	| { status: "skipped_unsupported" | "skipped_transient"; reason: string };

type ScenarioRecord = {
	provider: string;
	model: string | null;
	scenario: string;
	endpoint: Endpoint;
	stream: boolean;
	status: "passed" | "failed" | "skipped_no_model" | "skipped_unsupported" | "skipped_transient";
	error?: string;
	details?: Record<string, unknown>;
	elapsedMs: number;
};

type ModelsResponse = {
	total?: number;
	models?: Array<{
		model_id?: string;
		endpoints?: string[];
		providers?: Array<{
			api_provider_id?: string;
			endpoint?: string;
			is_active_gateway?: boolean;
		}>;
	}>;
};

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const LIVE_TEXT_MODERN_RUN = (process.env.LIVE_TEXT_MODERN_RUN ?? "").trim() === "1";
const REQUIRE_USAGE = (process.env.LIVE_TEXT_MODERN_REQUIRE_USAGE ?? "1").trim() !== "0";
const REQUIRE_USAGE_NONZERO = (process.env.LIVE_TEXT_MODERN_REQUIRE_USAGE_NONZERO ?? "1").trim() !== "0";
const ALLOW_UNSUPPORTED = (process.env.LIVE_TEXT_MODERN_ALLOW_UNSUPPORTED ?? "1").trim() !== "0";
const ALLOW_TRANSIENT_FAILURES = (process.env.LIVE_TEXT_MODERN_ALLOW_TRANSIENT_FAILURES ?? "1").trim() !== "0";
const INTERNAL_TEST_TOKEN =
	(process.env.LIVE_INTERNAL_TEST_TOKEN ?? process.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();
const MAX_OUTPUT_TOKENS = Number(process.env.LIVE_TEXT_MODERN_MAX_OUTPUT_TOKENS ?? "120");
const MESSAGES_MAX_TOKENS = Number(process.env.LIVE_TEXT_MODERN_MESSAGES_MAX_TOKENS ?? "256");

const PROVIDER_ALIASES: Record<string, string> = {
	novita: "novitaai",
	"novita-ai": "novitaai",
	novitaai: "novitaai",
	google: "google-ai-studio",
	"google-ai-studio": "google-ai-studio",
};

const DEFAULT_PROVIDERS = ["openai", "anthropic", "google-ai-studio", "minimax", "novitaai"] as const;
const UNSUPPORTED_STATUSES = new Set([400, 404, 405, 409, 415, 422, 501]);
const TRANSIENT_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

const FUNCTION_TOOL = {
	type: "function",
	function: {
		name: "get_weather",
		description: "Get weather for a city",
		parameters: {
			type: "object",
			properties: { city: { type: "string" } },
			required: ["city"],
		},
	},
} as const;

const ANTHROPIC_TOOL = {
	name: "get_weather",
	description: "Get weather for a city",
	input_schema: {
		type: "object",
		properties: { city: { type: "string" } },
		required: ["city"],
	},
} as const;

function normalizeProviderId(providerId: string): string {
	const normalized = providerId.trim().toLowerCase();
	return PROVIDER_ALIASES[normalized] ?? normalized;
}

function resolveGatewayUrl(pathname: string): string {
	const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL;
	const suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `${base}${suffix}`;
}

function getHeaders(): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${GATEWAY_API_KEY}`,
		"Content-Type": "application/json",
	};
	if (INTERNAL_TEST_TOKEN) headers["x-internal-test-token"] = INTERNAL_TEST_TOKEN;
	return headers;
}

function providerList(): string[] {
	const fromEnv = (process.env.LIVE_TEXT_MODERN_PROVIDERS ?? "")
		.split(/[\s,]+/)
		.map(normalizeProviderId)
		.filter(Boolean);
	return fromEnv.length ? Array.from(new Set(fromEnv)) : [...DEFAULT_PROVIDERS];
}

function parseModelOverrides(raw: string | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	for (const entry of String(raw ?? "").split(/[\s,]+/)) {
		if (!entry) continue;
		const idx = entry.indexOf("=");
		if (idx <= 0) continue;
		const provider = normalizeProviderId(entry.slice(0, idx));
		const model = entry.slice(idx + 1).trim();
		if (provider && model) out[provider] = model;
	}
	return out;
}

function usageFromPayload(payload: any): any {
	if (payload?.usage && typeof payload.usage === "object") return payload.usage;
	if (payload?.response?.usage && typeof payload.response.usage === "object") return payload.response.usage;
	return null;
}

function usageTotal(usage: any): number {
	if (!usage || typeof usage !== "object") return 0;
	const direct = Number(usage.total_tokens ?? usage.totalTokens);
	if (Number.isFinite(direct) && direct > 0) return direct;
	const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? usage.input_text_tokens ?? 0);
	const output = Number(usage.output_tokens ?? usage.completion_tokens ?? usage.output_text_tokens ?? 0);
	return (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
}

function assertUsage(payload: any, label: string) {
	if (!REQUIRE_USAGE) return;
	const usage = usageFromPayload(payload);
	expect(usage, `${label} missing usage`).toBeTruthy();
	if (!REQUIRE_USAGE_NONZERO) return;
	expect(usageTotal(usage) > 0, `${label} usage is zero`).toBe(true);
}

function parseJsonLoose(value: string): any | null {
	const text = String(value ?? "").trim();
	if (!text) return null;
	try {
		return JSON.parse(text);
	} catch {
		const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (!fenced?.[1]) return null;
		try {
			return JSON.parse(fenced[1].trim());
		} catch {
			return null;
		}
	}
}

function extractResponseText(json: any): string {
	if (typeof json?.output_text === "string" && json.output_text.trim()) return json.output_text;
	const output = Array.isArray(json?.output) ? json.output : [];
	const textParts: string[] = [];
	for (const item of output) {
		if (item?.type !== "message") continue;
		for (const part of Array.isArray(item?.content) ? item.content : []) {
			if (typeof part?.text === "string") textParts.push(part.text);
		}
	}
	return textParts.join("\n");
}

function extractChatText(json: any): string {
	const content = json?.choices?.[0]?.message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.map((part: any) => String(part?.text ?? ""))
			.filter(Boolean)
			.join("\n");
	}
	return "";
}

function extractMessagesText(json: any): string {
	const blocks = Array.isArray(json?.content) ? json.content : [];
	return blocks.map((block: any) => String(block?.text ?? block?.thinking ?? "")).join("\n");
}

function extractStreamText(frames: ParsedSseFrame[]): string {
	const chunks: string[] = [];
	for (const frame of frames) {
		const json = frame.json;
		if (!json || typeof json !== "object") continue;
		if (typeof json.delta === "string") chunks.push(json.delta);
		for (const choice of Array.isArray(json.choices) ? json.choices : []) {
			if (typeof choice?.delta?.content === "string") chunks.push(choice.delta.content);
			if (typeof choice?.message?.content === "string") chunks.push(choice.message.content);
		}
		if (json?.type === "content_block_delta") {
			const delta = json?.delta;
			if (typeof delta?.text === "string") chunks.push(delta.text);
			if (typeof delta?.partial_json === "string") chunks.push(delta.partial_json);
		}
		if (json?.type === "message_delta") {
			const text = String(json?.delta?.text ?? "");
			if (text) chunks.push(text);
		}
		chunks.push(extractResponseText(json));
		chunks.push(extractMessagesText(json));
	}
	return chunks.join("");
}

function hasStreamToolSignal(frames: ParsedSseFrame[]): boolean {
	for (const frame of frames) {
		if (
			frame.eventName === "response.function_call_arguments.delta" ||
			frame.eventName === "response.function_call_arguments.done" ||
			frame.eventName === "response.output_item.added" ||
			frame.eventName === "response.output_item.done"
		) {
			return true;
		}
		const json = frame.json;
		if (!json || typeof json !== "object") continue;
		if (json?.type === "content_block_start" && json?.content_block?.type === "tool_use") return true;
		for (const choice of Array.isArray(json.choices) ? json.choices : []) {
			const toolCalls = choice?.delta?.tool_calls ?? choice?.message?.tool_calls;
			if (Array.isArray(toolCalls) && toolCalls.length > 0) return true;
		}
	}
	return false;
}

function assertDoneFrame(frames: ParsedSseFrame[]) {
	const hasDoneFrame = frames.some((frame) => frame.data === "[DONE]");
	const hasTerminalEvent = frames.some((frame) => {
		if (typeof frame.eventName === "string" && /(?:done|completed|stop)$/i.test(frame.eventName)) {
			return true;
		}
		const json = frame.json;
		if (!json || typeof json !== "object") return false;
		const type = String(json?.type ?? "").toLowerCase();
		if (type === "response.completed" || type === "response.done" || type === "message_stop") return true;
		const finishReason = json?.choices?.[0]?.finish_reason;
		return typeof finishReason === "string" && finishReason.length > 0;
	});
	expect(hasDoneFrame || hasTerminalEvent, "Expected stream terminal marker ([DONE] or terminal event)").toBe(true);
}

function streamUsagePayload(frames: ParsedSseFrame[]): any {
	for (let i = frames.length - 1; i >= 0; i -= 1) {
		const usage = usageFromPayload(frames[i]?.json);
		if (usage) return { usage };
	}
	return {};
}

function withProviderOnlyHint(body: Record<string, unknown>, providerId: string): Record<string, unknown> {
	const provider = body.provider && typeof body.provider === "object"
		? (body.provider as Record<string, unknown>)
		: {};
	const existingOnly = Array.isArray(provider.only)
		? provider.only.map((entry) => normalizeProviderId(String(entry ?? ""))).filter(Boolean)
		: [];
	return {
		...body,
		provider: {
			...provider,
			only: Array.from(new Set([...existingOnly, providerId])),
		},
	};
}

const SCENARIOS: Record<string, Scenario> = {
	chat_stream_text: {
		id: "chat_stream_text",
		endpoint: "/chat/completions",
		stream: true,
		buildBody: (model) => ({
			model,
			stream: true,
			messages: [{ role: "user", content: "Reply with a short greeting." }],
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateStream: (frames) => {
			assertDoneFrame(frames);
			expect(extractStreamText(frames).trim().length).toBeGreaterThan(0);
		},
	},
	chat_stream_tool: {
		id: "chat_stream_tool",
		endpoint: "/chat/completions",
		stream: true,
		buildBody: (model) => ({
			model,
			stream: true,
			messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
			tools: [FUNCTION_TOOL],
			tool_choice: { type: "function", function: { name: "get_weather" } },
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateStream: (frames) => {
			assertDoneFrame(frames);
			const text = extractStreamText(frames).toLowerCase();
			expect(hasStreamToolSignal(frames) || text.includes("get_weather") || text.includes("<invoke")).toBe(true);
		},
	},
	chat_nonstream_tool: {
		id: "chat_nonstream_tool",
		endpoint: "/chat/completions",
		stream: false,
		buildBody: (model) => ({
			model,
			messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
			tools: [FUNCTION_TOOL],
			tool_choice: { type: "function", function: { name: "get_weather" } },
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateJson: (json) => {
			const toolCalls = json?.choices?.[0]?.message?.tool_calls;
			expect(Array.isArray(toolCalls) && toolCalls.length > 0).toBe(true);
		},
	},
	chat_nonstream_structured: {
		id: "chat_nonstream_structured",
		endpoint: "/chat/completions",
		stream: false,
		buildBody: (model) => ({
			model,
			messages: [{ role: "user", content: "Return JSON with city and weather, city=London." }],
			response_format: {
				type: "json_schema",
				json_schema: {
					name: "weather_schema",
					strict: true,
					schema: {
						type: "object",
						properties: { city: { type: "string" }, weather: { type: "string" } },
						required: ["city", "weather"],
						additionalProperties: false,
					},
				},
			},
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateJson: (json) => {
			const parsed = parseJsonLoose(extractChatText(json));
			expect(parsed).toBeTruthy();
			expect(typeof parsed?.city).toBe("string");
		},
	},
	chat_nonstream_reasoning: {
		id: "chat_nonstream_reasoning",
		endpoint: "/chat/completions",
		stream: false,
		buildBody: (model) => ({
			model,
			messages: [{ role: "user", content: "Solve 19*37 and output only the number." }],
			reasoning: { effort: "medium" },
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateJson: (json) => {
			const text = extractChatText(json).trim();
			const reasoning = String(json?.choices?.[0]?.message?.reasoning_content ?? "").trim();
			expect(text.length > 0 || reasoning.length > 0).toBe(true);
		},
	},
	responses_stream_text: {
		id: "responses_stream_text",
		endpoint: "/responses",
		stream: true,
		buildBody: (model) => ({
			model,
			stream: true,
			input: "Reply with a short greeting.",
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateStream: (frames) => {
			assertDoneFrame(frames);
			expect(extractStreamText(frames).trim().length).toBeGreaterThan(0);
		},
	},
	responses_stream_tool: {
		id: "responses_stream_tool",
		endpoint: "/responses",
		stream: true,
		buildBody: (model) => ({
			model,
			stream: true,
			input: "Call get_weather for London and return a tool call.",
			tools: [FUNCTION_TOOL],
			tool_choice: { type: "function", function: { name: "get_weather" } },
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateStream: (frames) => {
			assertDoneFrame(frames);
			const text = extractStreamText(frames).toLowerCase();
			expect(hasStreamToolSignal(frames) || text.includes("get_weather") || text.includes("<invoke")).toBe(true);
		},
	},
	responses_nonstream_tool: {
		id: "responses_nonstream_tool",
		endpoint: "/responses",
		stream: false,
		buildBody: (model) => ({
			model,
			input: "Call get_weather for London and return a tool call.",
			tools: [FUNCTION_TOOL],
			tool_choice: { type: "function", function: { name: "get_weather" } },
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateJson: (json) => {
			const output = Array.isArray(json?.output) ? json.output : [];
			const hasCall = output.some((item: any) => {
				const type = String(item?.type ?? "").toLowerCase();
				return type === "function_call" || type === "tool_call";
			});
			expect(hasCall || extractResponseText(json).toLowerCase().includes("get_weather")).toBe(true);
		},
	},
	responses_nonstream_structured: {
		id: "responses_nonstream_structured",
		endpoint: "/responses",
		stream: false,
		buildBody: (model) => ({
			model,
			input: "Return JSON with city and weather, city=London.",
			text: {
				format: {
					type: "json_schema",
					name: "weather_schema",
					strict: true,
					schema: {
						type: "object",
						properties: { city: { type: "string" }, weather: { type: "string" } },
						required: ["city", "weather"],
						additionalProperties: false,
					},
				},
			},
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateJson: (json) => {
			const parsed = parseJsonLoose(extractResponseText(json));
			expect(parsed).toBeTruthy();
		},
	},
	responses_nonstream_reasoning: {
		id: "responses_nonstream_reasoning",
		endpoint: "/responses",
		stream: false,
		buildBody: (model) => ({
			model,
			input: "Solve 19*37 and output only the number.",
			reasoning: { effort: "medium" },
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateJson: (json) => {
			expect(extractResponseText(json).trim().length).toBeGreaterThan(0);
		},
	},
	messages_stream_text: {
		id: "messages_stream_text",
		endpoint: "/messages",
		stream: true,
		buildBody: (model) => ({
			model,
			stream: true,
			max_tokens: MESSAGES_MAX_TOKENS,
			messages: [{ role: "user", content: "Reply with a short greeting." }],
			usage: true,
			meta: true,
		}),
		validateStream: (frames) => {
			assertDoneFrame(frames);
			expect(extractStreamText(frames).trim().length).toBeGreaterThan(0);
		},
	},
	messages_nonstream_tool: {
		id: "messages_nonstream_tool",
		endpoint: "/messages",
		stream: false,
		buildBody: (model) => ({
			model,
			max_tokens: MESSAGES_MAX_TOKENS,
			messages: [{ role: "user", content: "Call get_weather for London and return a tool call." }],
			tools: [ANTHROPIC_TOOL],
			tool_choice: { type: "tool", name: "get_weather" },
			usage: true,
			meta: true,
		}),
		validateJson: (json) => {
			const content = Array.isArray(json?.content) ? json.content : [];
			const hasToolUse = content.some((block: any) => block?.type === "tool_use");
			expect(hasToolUse || extractMessagesText(json).toLowerCase().includes("get_weather")).toBe(true);
		},
	},
	chat_stream_server_datetime: {
		id: "chat_stream_server_datetime",
		endpoint: "/chat/completions",
		stream: true,
		buildBody: (model) => ({
			model,
			stream: true,
			messages: [{ role: "user", content: "Use datetime tool in UTC and return current datetime." }],
			tools: [{ type: "gateway:datetime", parameters: { timezone: "UTC" } }],
			tool_choice: "gateway:datetime",
			max_output_tokens: MAX_OUTPUT_TOKENS,
			usage: true,
			meta: true,
		}),
		validateStream: (frames) => {
			assertDoneFrame(frames);
			const usage = usageFromPayload(streamUsagePayload(frames));
			const datetimeRequests = Number(usage?.server_tool_use?.datetime_requests ?? 0);
			expect(datetimeRequests > 0 || extractStreamText(frames).toLowerCase().includes("utc")).toBe(true);
		},
	},
};

const DEFAULT_SCENARIOS = [
	"chat_stream_text",
	"chat_stream_tool",
	"chat_nonstream_tool",
	"chat_nonstream_structured",
	"chat_nonstream_reasoning",
	"responses_stream_text",
	"responses_stream_tool",
	"responses_nonstream_tool",
	"responses_nonstream_structured",
	"responses_nonstream_reasoning",
	"messages_stream_text",
	"messages_nonstream_tool",
	"chat_stream_server_datetime",
] as const;

const SCENARIO_RUNS: ScenarioRecord[] = [];
const describeLive = LIVE_RUN && LIVE_TEXT_MODERN_RUN ? describe : describe.skip;

function scenarioList(): string[] {
	const fromEnv = (process.env.LIVE_TEXT_MODERN_SCENARIOS ?? "")
		.split(/[\s,]+/)
		.map((value) => value.trim())
		.filter(Boolean);
	return fromEnv.length ? fromEnv.filter((id) => id in SCENARIOS) : [...DEFAULT_SCENARIOS];
}

function scoreModelId(modelId: string): number {
	const lower = modelId.toLowerCase();
	let score = 100;
	if (lower.includes(":free")) score -= 80;
	if (lower.includes("nano")) score -= 40;
	if (lower.includes("mini")) score -= 30;
	if (lower.includes("flash")) score -= 20;
	if (lower.includes("pro")) score += 20;
	return score;
}

function chooseModel(providerId: string, candidates: string[]): string {
	const find = (needle: string) => candidates.find((model) => model.toLowerCase().includes(needle));
	if (providerId === "openai") return find("gpt-5-nano") ?? find("gpt-4.1-nano") ?? candidates[0];
	if (providerId === "google-ai-studio") return find("gemini-2.5-flash") ?? candidates[0];
	if (providerId === "anthropic") return find("haiku") ?? candidates[0];
	if (providerId === "novitaai") return find("llama-3.1-8b-instruct") ?? candidates[0];
	return [...candidates].sort((a, b) => scoreModelId(a) - scoreModelId(b))[0];
}

async function fetchModelsByProvider(providers: string[]): Promise<Map<string, string[]>> {
	const out = new Map<string, string[]>();
	const targets = new Set(providers);
	let offset = 0;
	const limit = 250;
	let total = Number.POSITIVE_INFINITY;
	while (offset < total) {
		const url = new URL(resolveGatewayUrl("/gateway/models"));
		url.searchParams.set("offset", String(offset));
		url.searchParams.set("limit", String(limit));
		const res = await fetch(url.toString(), { method: "GET", headers: { Authorization: `Bearer ${GATEWAY_API_KEY}` } });
		const payload = (await res.json()) as ModelsResponse;
		if (!res.ok) throw new Error(`Model discovery failed (${res.status}): ${JSON.stringify(payload)}`);
		const models = payload.models ?? [];
		for (const model of models) {
			const modelId = model.model_id;
			if (!modelId) continue;
			const supportsText = (model.endpoints ?? []).includes("text.generate");
			for (const provider of model.providers ?? []) {
				const providerId = normalizeProviderId(String(provider.api_provider_id ?? ""));
				if (!providerId || !targets.has(providerId)) continue;
				if (provider.is_active_gateway === false) continue;
				const providerSupportsText = provider.endpoint ? provider.endpoint === "text.generate" : supportsText;
				if (!providerSupportsText) continue;
				const existing = out.get(providerId) ?? [];
				if (!existing.includes(modelId)) existing.push(modelId);
				out.set(providerId, existing);
			}
		}
		total = typeof payload.total === "number" ? payload.total : models.length;
		offset += limit;
		if (!models.length) break;
	}
	return out;
}

async function runScenario(providerId: string, model: string, scenario: Scenario): Promise<ScenarioOutcome> {
	const body = withProviderOnlyHint(scenario.buildBody(model), providerId);
	const response = await fetch(resolveGatewayUrl(scenario.endpoint), {
		method: "POST",
		headers: getHeaders(),
		body: JSON.stringify(body),
	});
	if (!response.ok) {
		const text = await response.text();
		if (ALLOW_UNSUPPORTED && UNSUPPORTED_STATUSES.has(response.status)) {
			return { status: "skipped_unsupported", reason: `${response.status}: ${text.slice(0, 300)}` };
		}
		if (ALLOW_TRANSIENT_FAILURES && TRANSIENT_STATUSES.has(response.status)) {
			return { status: "skipped_transient", reason: `${response.status}: ${text.slice(0, 300)}` };
		}
		throw new Error(`${providerId}/${scenario.id} failed (${response.status}): ${text}`);
	}
	if (!scenario.stream) {
		const json = await response.json();
		scenario.validateJson?.(json);
		assertUsage(json, `${providerId}/${scenario.id}`);
		return { status: "passed", details: { id: json?.id ?? null } };
	}
	const frames = parseSseFrames(await readSseFrames(response));
	scenario.validateStream?.(frames);
	assertUsage(streamUsagePayload(frames), `${providerId}/${scenario.id}`);
	return { status: "passed", details: { frameCount: frames.length } };
}

function writeReport(providers: string[], scenarios: string[]) {
	const outPath = path.resolve(process.cwd(), "reports", "provider-live", "text-modern-features.json");
	const totals = {
		passed: SCENARIO_RUNS.filter((run) => run.status === "passed").length,
		failed: SCENARIO_RUNS.filter((run) => run.status === "failed").length,
		skipped_no_model: SCENARIO_RUNS.filter((run) => run.status === "skipped_no_model").length,
		skipped_unsupported: SCENARIO_RUNS.filter((run) => run.status === "skipped_unsupported").length,
		skipped_transient: SCENARIO_RUNS.filter((run) => run.status === "skipped_transient").length,
	};
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(
		outPath,
		JSON.stringify({ generated_at: new Date().toISOString(), gateway_url: GATEWAY_URL, providers, scenarios, totals, runs: SCENARIO_RUNS }, null, 2),
		"utf8",
	);
	console.log(`[live-text-modern] report: ${outPath}`);
}

describeLive("Live Text Modern Feature Matrix", () => {
	const providers = providerList();
	const scenarios = scenarioList();
	const modelByProvider = new Map<string, string>();
	const overrides = parseModelOverrides(process.env.LIVE_TEXT_MODERN_MODEL_OVERRIDES);

	beforeAll(async () => {
		if (!GATEWAY_API_KEY) throw new Error("GATEWAY_API_KEY is required for live tests");
		const discovered = await fetchModelsByProvider(providers);
		for (const providerId of providers) {
			if (overrides[providerId]) {
				modelByProvider.set(providerId, overrides[providerId]);
				continue;
			}
			const candidates = discovered.get(providerId) ?? [];
			if (candidates.length > 0) modelByProvider.set(providerId, chooseModel(providerId, candidates));
		}
	});

	afterAll(() => writeReport(providers, scenarios));

	for (const providerId of providers) {
		describe(providerId, () => {
			for (const scenarioId of scenarios) {
				const scenario = SCENARIOS[scenarioId];
				it(scenario.id, async () => {
					const startedAt = Date.now();
					const model = modelByProvider.get(providerId) ?? null;
					if (!model) {
						SCENARIO_RUNS.push({
							provider: providerId,
							model: null,
							scenario: scenario.id,
							endpoint: scenario.endpoint,
							stream: scenario.stream,
							status: "skipped_no_model",
							error: "No text.generate model discovered",
							elapsedMs: Date.now() - startedAt,
						});
						return;
					}
					try {
						const outcome = await runScenario(providerId, model, scenario);
						if (outcome.status !== "passed") {
							SCENARIO_RUNS.push({
								provider: providerId,
								model,
								scenario: scenario.id,
								endpoint: scenario.endpoint,
								stream: scenario.stream,
								status: outcome.status,
								error: outcome.reason,
								elapsedMs: Date.now() - startedAt,
							});
							return;
						}
						SCENARIO_RUNS.push({
							provider: providerId,
							model,
							scenario: scenario.id,
							endpoint: scenario.endpoint,
							stream: scenario.stream,
							status: "passed",
							details: outcome.details,
							elapsedMs: Date.now() - startedAt,
						});
					} catch (error) {
						SCENARIO_RUNS.push({
							provider: providerId,
							model,
							scenario: scenario.id,
							endpoint: scenario.endpoint,
							stream: scenario.stream,
							status: "failed",
							error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
							elapsedMs: Date.now() - startedAt,
						});
						throw error;
					}
				}, 120_000);
			}
		});
	}
});
