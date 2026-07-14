import { beforeAll, describe, expect, it } from "vitest";
import { parseSseFrames, readSseFrames } from "../helpers/sse";
import { resolveGatewayApiKeyFromEnv } from "../helpers/gatewayKey";

type ModelProviderRef = {
	api_provider_id?: string;
	endpoint?: string;
	is_active_gateway?: boolean;
};

type GatewayModel = {
	model_id?: string;
	endpoints?: string[];
	providers?: ModelProviderRef[];
};

type ModelsResponse = {
	total?: number;
	models?: GatewayModel[];
};

type ScenarioId = "chat_stream_native_tool" | "responses_stream_native_tool" | "chat_stream_server_datetime";

type Scenario = {
	id: ScenarioId;
	endpoint: "/chat/completions" | "/responses";
	buildBody: (model: string) => Record<string, unknown>;
	expectToolSignal: boolean;
	serverTool: boolean;
};

type ScenarioOutcome = { status: "passed"; details: Record<string, unknown> } | { status: "skipped_unsupported"; reason: string };

type ScenarioRecord = {
	provider: string;
	model: string | null;
	scenario: ScenarioId;
	endpoint: string;
	status: "passed" | "failed" | "skipped_no_model" | "skipped_unsupported";
	error?: string;
	details?: Record<string, unknown>;
};

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1";
const GATEWAY_API_KEY = resolveGatewayApiKeyFromEnv(process.env);
const LIVE_RUN = (process.env.LIVE_RUN ?? "").trim() === "1";
const LIVE_STREAM_TOOLS_RUN = (process.env.LIVE_STREAM_TOOLS_RUN ?? "").trim() === "1";
const REQUIRE_USAGE = (process.env.LIVE_STREAM_TOOLS_REQUIRE_USAGE ?? "0").trim() === "1";
const INCLUDE_NOVITA_TESTING_MODE = (process.env.LIVE_STREAM_TOOLS_NOVITA_TESTING_MODE ?? "0").trim() === "1";
const INTERNAL_TEST_TOKEN = (process.env.LIVE_INTERNAL_TEST_TOKEN ?? process.env.GATEWAY_INTERNAL_TEST_TOKEN ?? "").trim();

const PROVIDER_ALIASES: Record<string, string> = {
	novita: "novitaai",
	"novita-ai": "novitaai",
	"novitaai": "novitaai",
	google: "google-ai-studio",
	"google-ai-studio": "google-ai-studio",
};

const DEFAULT_PROVIDERS = ["openai", "google-ai-studio", "minimax", "novitaai"] as const;

const SCENARIOS: Record<ScenarioId, Scenario> = {
	chat_stream_native_tool: {
		id: "chat_stream_native_tool",
		endpoint: "/chat/completions",
		expectToolSignal: true,
		serverTool: false,
		buildBody: (model) => ({
			model,
			stream: true,
			messages: [
				{
					role: "user",
					content: "Call get_weather for London and return a tool call.",
				},
			],
			tools: [
				{
					type: "function",
					function: {
						name: "get_weather",
						description: "Get weather for a city",
						parameters: {
							type: "object",
							properties: {
								city: { type: "string" },
							},
							required: ["city"],
						},
					},
				},
			],
			tool_choice: {
				type: "function",
				function: { name: "get_weather" },
			},
		}),
	},
	responses_stream_native_tool: {
		id: "responses_stream_native_tool",
		endpoint: "/responses",
		expectToolSignal: true,
		serverTool: false,
		buildBody: (model) => ({
			model,
			stream: true,
			input: "Call get_weather for London and return a tool call.",
			tools: [
				{
					type: "function",
					function: {
						name: "get_weather",
						description: "Get weather for a city",
						parameters: {
							type: "object",
							properties: {
								city: { type: "string" },
							},
							required: ["city"],
						},
					},
				},
			],
			tool_choice: {
				type: "function",
				function: { name: "get_weather" },
			},
		}),
	},
	chat_stream_server_datetime: {
		id: "chat_stream_server_datetime",
		endpoint: "/chat/completions",
		expectToolSignal: false,
		serverTool: true,
		buildBody: (model) => ({
			model,
			stream: true,
			messages: [
				{
					role: "user",
					content: "Use the datetime tool and tell me the current UTC datetime.",
				},
			],
			tools: [
				{
					type: "gateway:datetime",
					parameters: {
						timezone: "UTC",
					},
				},
			],
			tool_choice: "gateway:datetime",
		}),
	},
};

const STREAM_TOOL_RUNS: ScenarioRecord[] = [];
const UNSUPPORTED_STATUSES = new Set([400, 404, 405, 409, 422, 501]);
const describeLive = LIVE_RUN && LIVE_STREAM_TOOLS_RUN ? describe : describe.skip;

function normalizeProviderId(providerId: string): string {
	const normalized = providerId.trim().toLowerCase();
	if (!normalized) return "";
	return PROVIDER_ALIASES[normalized] ?? normalized;
}

function providerList(): string[] {
	const fromEnv = (process.env.LIVE_STREAM_TOOLS_PROVIDERS ?? "").split(/[\s,]+/).map(normalizeProviderId).filter(Boolean);
	if (fromEnv.length > 0) return Array.from(new Set(fromEnv));
	return [...DEFAULT_PROVIDERS];
}

function scenarioList(): ScenarioId[] {
	const fromEnv = (process.env.LIVE_STREAM_TOOLS_SCENARIOS ?? "").split(/[\s,]+/).map((value) => value.trim()).filter(Boolean) as ScenarioId[];
	if (!fromEnv.length) {
		return Object.keys(SCENARIOS) as ScenarioId[];
	}
	return fromEnv.filter((id): id is ScenarioId => id in SCENARIOS);
}

function resolveGatewayUrl(pathname: string): string {
	const base = GATEWAY_URL.endsWith("/") ? GATEWAY_URL.slice(0, -1) : GATEWAY_URL, suffix = pathname.startsWith("/") ? pathname : `/${pathname}`;
	return `${base}${suffix}`;
}

function scoreModelId(modelId: string): number {
	const lower = modelId.toLowerCase();
	let score = 100;
	const add = (needle: string, delta: number) => {
		if (lower.includes(needle)) score += delta;
	};
	add(":free", -80);
	add("nano", -40);
	add("mini", -30);
	add("flash", -20);
	add("lite", -20);
	add("pro", 25);
	add("thinking", 20);
	return score;
}

function pickCheapestCandidate(models: string[]): string {
	return [...models].sort((a, b) => {
		const score = scoreModelId(a) - scoreModelId(b);
		if (score !== 0) return score;
		return a.localeCompare(b);
	})[0];
}

function chooseModelForProvider(providerId: string, candidates: string[]): string {
	if (providerId === "openai") {
		const preferred = candidates.find((model) => model.toLowerCase().includes("gpt-5-nano"));
		if (preferred) return preferred;
	}
	if (providerId === "google-ai-studio") {
		const preferred = candidates.find((model) => model.toLowerCase().includes("gemini-2.5-flash"));
		if (preferred) return preferred;
	}
	if (providerId === "novitaai") {
		const preferred = candidates.find((model) =>
			model.toLowerCase().includes("llama-3.1-8b-instruct"),
		);
		if (preferred) return preferred;
	}
	if (providerId === "minimax") {
		const preferred = candidates.find((model) => model.toLowerCase().includes("minimax"));
		if (preferred) return preferred;
	}
	return pickCheapestCandidate(candidates);
}

async function fetchModelsByProvider(providers: string[]): Promise<Map<string, string[]>> {
	const out = new Map<string, string[]>();
	const target = new Set(providers);
	let offset = 0;
	const limit = 250;
	let total = Number.POSITIVE_INFINITY;

	while (offset < total) {
		const url = new URL(resolveGatewayUrl("/models"));
		url.searchParams.set("offset", String(offset));
		url.searchParams.set("limit", String(limit));
		const response = await fetch(url.toString(), {
			method: "GET",
			headers: {
				Authorization: `Bearer ${GATEWAY_API_KEY}`,
			},
		});
		const payload = (await response.json()) as ModelsResponse;
		if (!response.ok) {
			throw new Error(`Failed to discover models (${response.status}): ${JSON.stringify(payload)}`);
		}

		const models = payload.models ?? [];
		for (const model of models) {
			const modelId = model.model_id;
			if (!modelId) continue;
			const modelEndpoints = Array.isArray(model.endpoints)
				? model.endpoints.map((value) => String(value))
				: [];
			const modelSupportsText = modelEndpoints.includes("text.generate");

			for (const provider of model.providers ?? []) {
				const providerId = normalizeProviderId(String(provider.api_provider_id ?? ""));
				if (!providerId || !target.has(providerId)) continue;
				if (provider.is_active_gateway === false) continue;
				const providerSupportsText = provider.endpoint
					? provider.endpoint === "text.generate"
					: modelSupportsText;
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

function withProviderOnlyHint(body: Record<string, unknown>, providerId: string): Record<string, unknown> {
	const existingProvider =
		body.provider && typeof body.provider === "object"
			? (body.provider as Record<string, unknown>)
			: {};
	const existingOnly = Array.isArray(existingProvider.only)
		? existingProvider.only.map((entry) => normalizeProviderId(String(entry ?? ""))).filter(Boolean)
		: [];
	return {
		...body,
		provider: {
			...existingProvider,
			only: Array.from(new Set([...existingOnly, providerId])),
		},
	};
}

function getHeaders(args?: { testingMode?: boolean }): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${GATEWAY_API_KEY}`,
		"Content-Type": "application/json",
	};
	if (INTERNAL_TEST_TOKEN) {
		headers["x-internal-test-token"] = INTERNAL_TEST_TOKEN;
	}
	if (args?.testingMode) {
		headers["x-phaseo-testing-mode"] = "1";
	}
	return headers;
}

function extractUsage(payload: any): any {
	if (!payload || typeof payload !== "object") return null;
	if (payload.usage && typeof payload.usage === "object") return payload.usage;
	if (payload.response?.usage && typeof payload.response.usage === "object") return payload.response.usage;
	return null;
}

function collectTextHint(entries: Array<{ eventName: string | null; json: any | null; data: string }>): string {
	const chunks: string[] = [];
	for (const entry of entries) {
		const json = entry.json;
		if (!json || typeof json !== "object") continue;
		if (typeof json.delta === "string") chunks.push(json.delta);
		if (Array.isArray(json.choices)) {
			for (const choice of json.choices) {
				const delta = choice?.delta ?? {};
				if (typeof delta?.content === "string") chunks.push(delta.content);
				if (typeof delta?.reasoning_content === "string") chunks.push(delta.reasoning_content);
				if (typeof choice?.message?.content === "string") chunks.push(choice.message.content);
			}
		}
		const outputItems = Array.isArray(json.output) ? json.output : [];
		for (const item of outputItems) {
			if (item?.type === "message" && Array.isArray(item?.content)) {
				for (const part of item.content) {
					if (typeof part?.text === "string") chunks.push(part.text);
				}
			}
		}
	}
	return chunks.join("\n").toLowerCase();
}

function hasToolSignal(
	entries: Array<{ eventName: string | null; json: any | null; data: string }>,
): boolean {
	for (const entry of entries) {
		const eventName = String(entry.eventName ?? "");
		if (
			eventName === "response.function_call_arguments.delta" ||
			eventName === "response.function_call_arguments.done" ||
			eventName === "response.output_item.added" ||
			eventName === "response.output_item.done"
		) {
			return true;
		}
		const json = entry.json;
		if (!json || typeof json !== "object") continue;

		if (Array.isArray(json.choices)) {
			for (const choice of json.choices) {
				const toolCalls = choice?.delta?.tool_calls ?? choice?.message?.tool_calls;
				if (Array.isArray(toolCalls) && toolCalls.length > 0) return true;
			}
		}

		const output = Array.isArray(json.output) ? json.output : [];
		if (
			output.some((item: any) => {
				const type = String(item?.type ?? "").toLowerCase();
				return type === "function_call" || type === "tool_call";
			})
		) {
			return true;
		}
	}
	return false;
}

async function runScenario(
	providerId: string,
	model: string,
	scenario: Scenario,
): Promise<ScenarioOutcome> {
	const requestBody = withProviderOnlyHint(scenario.buildBody(model), providerId);
	const useNovitaTestingMode = providerId === "novitaai" && INCLUDE_NOVITA_TESTING_MODE;
	const response = await fetch(resolveGatewayUrl(scenario.endpoint), {
		method: "POST",
		headers: getHeaders({ testingMode: useNovitaTestingMode }),
		body: JSON.stringify(requestBody),
	});

	if (!response.ok) {
		const text = await response.text();
		if (UNSUPPORTED_STATUSES.has(response.status)) {
			return {
				status: "skipped_unsupported",
				reason: `${response.status}: ${text.slice(0, 300)}`,
			};
		}
		throw new Error(`${providerId}/${scenario.id} failed (${response.status}): ${text}`);
	}

	const rawFrames = await readSseFrames(response);
	const parsedFrames = parseSseFrames(rawFrames);
	const doneCount = parsedFrames.filter((frame) => frame.data === "[DONE]").length;
	const objectFrames = parsedFrames.filter(
		(frame) => frame.json && typeof frame.json === "object",
	);
	const usageCarrier =
		[...objectFrames]
			.reverse()
			.find((frame) => extractUsage(frame.json))?.json ??
		objectFrames[objectFrames.length - 1]?.json ??
		null;
	const usage = extractUsage(usageCarrier);
	const sawToolSignal = hasToolSignal(parsedFrames);
	const textHint = collectTextHint(parsedFrames);
	const hasFallbackToolHint =
		textHint.includes("get_weather") ||
		textHint.includes("<invoke") ||
		textHint.includes("tool call");

	if (scenario.expectToolSignal) {
		expect(
			sawToolSignal || hasFallbackToolHint,
			`${providerId}/${scenario.id} expected tool signal in stream`,
		).toBe(true);
	}
	if (REQUIRE_USAGE) {
		expect(usage, `${providerId}/${scenario.id} missing usage in stream`).toBeTruthy();
	}

	const datetimeRequests = Number(usage?.server_tool_use?.datetime_requests ?? 0);

	return {
		status: "passed",
		details: {
			frameCount: parsedFrames.length,
			objectFrameCount: objectFrames.length,
			doneCount,
			sawToolSignal,
			hasFallbackToolHint,
			serverToolScenario: scenario.serverTool,
			datetimeRequests: Number.isFinite(datetimeRequests) ? datetimeRequests : 0,
		},
	};
}

describeLive("Live Stream + Tool Matrix (Gateway)", () => {
	const providers = providerList();
	const scenarios = scenarioList();
	const modelByProvider = new Map<string, string>();

	beforeAll(async () => {
		if (!GATEWAY_API_KEY) {
			throw new Error("GATEWAY_API_KEY is required when LIVE_RUN=1 and LIVE_STREAM_TOOLS_RUN=1");
		}
		const discovered = await fetchModelsByProvider(providers);
		for (const providerId of providers) {
			const candidates = discovered.get(providerId) ?? [];
			if (!candidates.length) continue;
			modelByProvider.set(providerId, chooseModelForProvider(providerId, candidates));
		}
	});

	for (const providerId of providers) {
		describe(providerId, () => {
			for (const scenarioId of scenarios) {
				const scenario = SCENARIOS[scenarioId];
				it(scenario.id, async () => {
					const model = modelByProvider.get(providerId) ?? null;
					if (!model) {
						const message =
							`No text.generate model discovered for ${providerId}. ` +
							`Set LIVE_STREAM_TOOLS_PROVIDERS or add a model override path first.`;
						console.warn(`[live-stream-tools] ${message}`);
						STREAM_TOOL_RUNS.push({
							provider: providerId,
							model: null,
							scenario: scenario.id,
							endpoint: scenario.endpoint,
							status: "skipped_no_model",
							error: message,
						});
						return;
					}

					try {
						const outcome = await runScenario(providerId, model, scenario);
						if (outcome.status === "skipped_unsupported") {
							STREAM_TOOL_RUNS.push({
								provider: providerId,
								model,
								scenario: scenario.id,
								endpoint: scenario.endpoint,
								status: "skipped_unsupported",
								error: outcome.reason,
							});
							console.warn(
								`[live-stream-tools] skipped unsupported ${providerId}/${scenario.id}: ${outcome.reason}`,
							);
							return;
						}
						STREAM_TOOL_RUNS.push({
							provider: providerId,
							model,
							scenario: scenario.id,
							endpoint: scenario.endpoint,
							status: "passed",
							details: outcome.details,
						});
						console.log(
							JSON.stringify({
								tag: `${providerId}::${scenario.id}`,
								model,
								...outcome.details,
							}),
						);
					} catch (error) {
						const serialized =
							error instanceof Error ? `${error.name}: ${error.message}` : String(error);
						STREAM_TOOL_RUNS.push({
							provider: providerId,
							model,
							scenario: scenario.id,
							endpoint: scenario.endpoint,
							status: "failed",
							error: serialized,
						});
						throw error;
					}
				}, 120_000);
			}
		});
	}
});
