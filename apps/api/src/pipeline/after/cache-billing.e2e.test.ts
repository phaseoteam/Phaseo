// End-to-end prompt-cache billing: provider payload -> executor -> after-stage -> charge.
// Each case uses the usage shape the provider documents, prices it with a known card and
// checks the charged amount equals uncached input + cache reads + cache writes + output at
// their own rates, for streamed and buffered responses on every OpenAI-shaped surface.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	charge: vi.fn(),
	auditSuccess: vi.fn(),
	auditFailure: vi.fn(),
	background: [] as Promise<unknown>[],
}));

vi.mock("../audit", () => ({ auditSuccess: mocks.auditSuccess, auditFailure: mocks.auditFailure }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: mocks.charge }));
vi.mock("./guards", () => ({ guardUpstreamStatus: async () => ({ ok: true }) }));
vi.mock("@observability/events", () => ({ emitGatewayRequestEvent: vi.fn() }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: vi.fn() }));
vi.mock("../execute/health", () => ({
	classifyProviderHealthImpact: () => "success",
	onCallEnd: vi.fn(async () => undefined),
	reportProbeResult: vi.fn(),
	maybeOpenOnRecentErrors: vi.fn(),
}));
vi.mock("../execute/sticky-routing", () => ({
	maybeWriteStickyRoutingFromUsage: vi.fn(),
	resolveCacheAwareRoutingPreference: () => false,
}));
vi.mock("../pricing/byok-fee", () => ({
	applyByokServiceFee: async ({ baseCostNanos, pricedUsage, currencyHint }: any) => ({
		totalCents: Math.ceil(baseCostNanos / 1e7),
		totalNanos: baseCostNanos,
		currency: currencyHint,
		pricedUsage,
	}),
}));
vi.mock("@/plugins/registry", () => ({
	applyResponsePlugins: ({ payload }: any) => ({ payload, executions: [] }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("@/runtime/env", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/runtime/env")>();
	return {
		...actual,
		ensureRuntimeForBackground: () => () => {},
		dispatchBackground: (promise: Promise<unknown>) => { mocks.background.push(promise); },
		getResponseCache: () => null,
	};
});

import { finalizeRequest } from "./index";
import { handleStreamResponse } from "./stream";
import { encodeProtocol } from "@protocols/index";
import { executeAnthropic } from "@executors/anthropic/text-generate";
import { execute as executeBedrock } from "@executors/amazon-bedrock/text-generate";
import { execute as executeVertex } from "@executors/google-vertex/text-generate";
import { transformStream as transformGeminiStream } from "@executors/google-ai-studio/text-generate";
import { bufferStreamToIR, resolveStreamForProtocol } from "@executors/_shared/text-generate/openai-compat";
import { openAIChatToIR } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { normalizeTextUsageForPricing } from "@executors/_shared/usage/text";
import { googleUsageMetadataToIRUsage } from "@providers/google-ai-studio/usage";
import { setupRuntimeFromEnv, setupTestRuntime, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { expectedNanos, sse, textCard, type TokenPrices } from "./__tests__/cache-billing-harness";

type Endpoint = "chat.completions" | "responses" | "messages";
type Tokens = { uncached: number; read: number; write5m?: number; write1h?: number; write?: number; output: number };

const PROTOCOL: Record<Endpoint, string> = {
	"chat.completions": "openai.chat.completions",
	responses: "openai.responses",
	messages: "anthropic.messages",
};

async function settle() {
	for (let i = 0; i < 6; i++) {
		await new Promise((resolve) => setTimeout(resolve, 0));
		const pending = mocks.background.splice(0);
		await Promise.all(pending);
	}
}

function charged(): number {
	// Report mode records what a build charges (-1 = finalization failed, nothing billed).
	if (process.env.CACHE_BILLING_REPORT === "1" && mocks.charge.mock.calls.length === 0) return -1;
	expect(mocks.auditFailure).not.toHaveBeenCalled();
	expect(mocks.charge).toHaveBeenCalledTimes(1);
	return mocks.charge.mock.calls[0][0].costNanos;
}

function expectedCost(tokens: Tokens, prices: TokenPrices): number {
	const writeLines: Array<[number, number]> = [];
	if (tokens.write5m) writeLines.push([tokens.write5m, Number(prices.cachedWrite5m ?? prices.cachedWrite)]);
	if (tokens.write1h) writeLines.push([tokens.write1h, Number(prices.cachedWrite1h ?? prices.cachedWrite)]);
	if (tokens.write) writeLines.push([tokens.write, Number(prices.cachedWrite ?? prices.input)]);
	return expectedNanos([
		[tokens.uncached, Number(prices.input)],
		[tokens.read, Number(prices.cachedRead ?? prices.input)],
		...writeLines,
		[tokens.output, Number(prices.output)],
	]);
}

function totalInput(tokens: Tokens): number {
	return tokens.uncached + tokens.read + (tokens.write5m ?? 0) + (tokens.write1h ?? 0) + (tokens.write ?? 0);
}

function ctxFor(endpoint: Endpoint, model: string, stream: boolean, card: ReturnType<typeof textCard>, pricingKey: string): any {
	return {
		requestId: "req_cache_billing",
		billingRequestId: "bill_cache_billing",
		workspaceId: "ws_cache_billing",
		endpoint,
		protocol: PROTOCOL[endpoint],
		capability: "text.generate",
		model,
		requestedModel: model,
		stream,
		body: { model, stream },
		rawBody: { model, stream },
		meta: { requestId: "req_cache_billing", startedAtMs: Date.now() - 50, upstreamStartMs: Date.now() - 40 },
		providers: [],
		pricing: { [pricingKey]: card },
		timer: { span: (_name: string, fn: () => unknown) => fn(), mark: () => {}, end: () => {} },
	};
}

function executorArgs(endpoint: Endpoint, providerId: string, providerModelSlug: string, stream: boolean): any {
	return {
		ir: { model: providerModelSlug, stream, messages: [{ role: "user", content: [{ type: "text", text: "Continue the task." }] }] },
		requestId: "req_cache_billing",
		workspaceId: "ws_cache_billing",
		providerId,
		endpoint,
		protocol: PROTOCOL[endpoint],
		capability: "text.generate",
		providerModelSlug,
		capabilityParams: null,
		byokMeta: [{ id: "byok_1", key: "test-key" }],
		pricingCard: null,
		meta: {},
	};
}

/** Run a buffered response through the after-stage and return the charge and client usage. */
async function runNonStream(args: {
	endpoint: Endpoint;
	provider: string;
	model: string;
	card: ReturnType<typeof textCard>;
	executor: { ir: any; bill: any; rawResponse?: any };
}) {
	const ctx = ctxFor(args.endpoint, args.model, false, args.card, args.provider);
	const result: any = {
		kind: "completed",
		provider: args.provider,
		pricingKey: args.provider,
		apiModelId: null,
		upstream: new Response(null, { status: 200 }),
		ir: args.executor.ir,
		rawResponse: args.executor.rawResponse,
		normalized: encodeProtocol(ctx.protocol, args.executor.ir, ctx.requestId),
		bill: { cost_cents: 0, currency: "USD", ...args.executor.bill },
	};
	const response = await finalizeRequest({ pre: { ok: true, ctx }, exec: { ok: true, result }, endpoint: args.endpoint as any });
	const body = await response.json();
	await settle();
	return { nanos: charged(), usage: body.usage };
}

/** Run a streamed response through the after-stage and return the charge and final client usage. */
async function runStream(args: {
	endpoint: Endpoint;
	provider: string;
	model: string;
	card: ReturnType<typeof textCard>;
	executor: { stream: ReadableStream<Uint8Array>; usageFinalizer?: () => Promise<any>; usageFinalizerAuthoritative?: boolean; bill?: any };
}) {
	const ctx = ctxFor(args.endpoint, args.model, true, args.card, args.provider);
	const result: any = {
		kind: "stream",
		provider: args.provider,
		pricingKey: args.provider,
		upstream: new Response(null, { status: 200 }),
		stream: args.executor.stream,
		usageFinalizer: args.executor.usageFinalizer ?? (async () => null),
		usageFinalizerAuthoritative: args.executor.usageFinalizerAuthoritative,
		bill: args.executor.bill ?? { cost_cents: 0, currency: "USD", usage: undefined, finish_reason: null },
	};
	const response = await handleStreamResponse(ctx, result, args.card);
	const text = await response.text();
	await settle();
	const usageFrames = text
		.split("\n")
		.filter((line) => line.startsWith("data: ") && line.includes("\"usage\""))
		.map((line) => JSON.parse(line.slice(6)));
	const last = usageFrames.at(-1);
	return { nanos: charged(), usage: last?.usage ?? last?.response?.usage ?? null };
}

function report(name: string, nanos: number, expected: number) {
	if (process.env.CACHE_BILLING_REPORT === "1") {
		console.log(`[cache-billing] ${name} charged=${nanos} expected=${expected}`);
	}
}

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

beforeEach(() => {
	mocks.charge.mockReset().mockResolvedValue(undefined);
	mocks.auditSuccess.mockReset().mockResolvedValue(undefined);
	mocks.auditFailure.mockReset().mockResolvedValue(undefined);
	mocks.background.length = 0;
	vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------------------
// Claude: Anthropic, Bedrock Messages and Vertex. Anthropic's input_tokens excludes cache
// reads and writes (https://docs.claude.com/en/docs/build-with-claude/prompt-caching).
// ---------------------------------------------------------------------------------------

const claudeUsage = {
	input_tokens: 2_100,
	cache_creation_input_tokens: 3_000,
	cache_read_input_tokens: 48_000,
	cache_creation: { ephemeral_5m_input_tokens: 2_000, ephemeral_1h_input_tokens: 1_000 },
	output_tokens: 850,
};
const claudeTokens: Tokens = { uncached: 2_100, read: 48_000, write5m: 2_000, write1h: 1_000, output: 850 };
const sonnetPrices: TokenPrices = { input: "3", output: "15", cachedRead: "0.3", cachedWrite5m: "3.75", cachedWrite1h: "6" };

function claudeSse(): string {
	const frames = [
		{ event: "message_start", data: { type: "message_start", message: { id: "msg_01", type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [], stop_reason: null, stop_sequence: null, usage: { ...claudeUsage, output_tokens: 1 } } } },
		{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
		{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Edited the file." } } },
		{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
		{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 850 } } },
		{ event: "message_stop", data: { type: "message_stop" } },
	];
	return frames.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

function claudeMessage() {
	return {
		id: "msg_01", type: "message", role: "assistant", model: "claude-sonnet-4-6",
		content: [{ type: "text", text: "Edited the file." }],
		stop_reason: "end_turn", stop_sequence: null, usage: claudeUsage,
	};
}

function stubFetch(handler: (url: string, init: any) => Response) {
	vi.stubGlobal("fetch", vi.fn(async (input: any, init: any) => handler(String(input?.url ?? input), init)));
}

async function asCompleted(result: any) {
	expect(result.kind).toBe("completed");
	return { ir: result.ir, bill: result.bill, rawResponse: result.rawResponse };
}

function expectOpenAIClientUsage(endpoint: Endpoint, usage: any, tokens: Tokens) {
	const write = (tokens.write5m ?? 0) + (tokens.write1h ?? 0) + (tokens.write ?? 0);
	if (endpoint === "chat.completions") {
		expect(usage.prompt_tokens).toBe(totalInput(tokens));
		expect(usage.prompt_tokens_details.cached_tokens).toBe(tokens.read);
		if (write) expect(usage.prompt_tokens_details.cache_write_tokens).toBe(write);
		expect(usage.completion_tokens_details?.cached_tokens).toBeUndefined();
	} else if (endpoint === "responses") {
		expect(usage.input_tokens).toBe(totalInput(tokens));
		expect(usage.input_tokens_details.cached_tokens).toBe(tokens.read);
		if (write) expect(usage.input_tokens_details.cache_write_tokens).toBe(write);
		expect(usage.output_tokens_details?.cached_tokens).toBeUndefined();
	} else {
		expect(usage.input_tokens).toBe(tokens.uncached);
		expect(usage.cache_read_input_tokens).toBe(tokens.read);
		// Anthropic documents cache_creation_input_tokens as nullable; null means no writes.
		expect(usage.cache_creation_input_tokens ?? 0).toBe(write);
	}
}

describe("Claude on Anthropic", () => {
	const card = textCard("anthropic", "anthropic/claude-sonnet-4-6", sonnetPrices);
	const expected = expectedCost(claudeTokens, sonnetPrices);

	for (const endpoint of ["chat.completions", "responses", "messages"] as const) {
		it(`bills reads, both write TTLs and uncached input on ${endpoint} (buffered)`, async () => {
			stubFetch(() => new Response(claudeSse(), { headers: { "content-type": "text/event-stream" } }));
			const executor = await asCompleted(await executeAnthropic(executorArgs(endpoint, "anthropic", "claude-sonnet-4-6", false)));
			const { nanos, usage } = await runNonStream({ endpoint, provider: "anthropic", model: "anthropic/claude-sonnet-4-6", card, executor });
			report(`anthropic ${endpoint} buffered`, nanos, expected);
			expect(nanos).toBe(expected);
			expectOpenAIClientUsage(endpoint, usage, claudeTokens);
		});

		it(`bills reads, both write TTLs and uncached input on ${endpoint} (streamed)`, async () => {
			stubFetch(() => new Response(claudeSse(), { headers: { "content-type": "text/event-stream" } }));
			const executor: any = await executeAnthropic(executorArgs(endpoint, "anthropic", "claude-sonnet-4-6", true));
			expect(executor.kind).toBe("stream");
			const { nanos, usage } = await runStream({ endpoint, provider: "anthropic", model: "anthropic/claude-sonnet-4-6", card, executor });
			report(`anthropic ${endpoint} streamed`, nanos, expected);
			expect(nanos).toBe(expected);
			if (endpoint !== "messages") expectOpenAIClientUsage(endpoint, usage, claudeTokens);
		});
	}
});

describe("Claude on Bedrock Messages", () => {
	const card = textCard("amazon-bedrock", "anthropic/claude-sonnet-4-6", sonnetPrices);
	const expected = expectedCost(claudeTokens, sonnetPrices);

	it("bills cache reads and writes on /v1/messages (buffered)", async () => {
		stubFetch(() => Response.json(claudeMessage(), { headers: { "x-amzn-requestid": "aws_req_1" } }));
		const executor = await asCompleted(await executeBedrock(executorArgs("messages", "amazon-bedrock", "anthropic.claude-sonnet-4-6", false)));
		const { nanos, usage } = await runNonStream({ endpoint: "messages", provider: "amazon-bedrock", model: "anthropic/claude-sonnet-4-6", card, executor });
		report("bedrock messages buffered", nanos, expected);
		expect(nanos).toBe(expected);
		expectOpenAIClientUsage("messages", usage, claudeTokens);
	});

	it("bills cache reads and writes on /v1/messages (streamed)", async () => {
		stubFetch(() => new Response(claudeSse(), { headers: { "content-type": "text/event-stream", "x-amzn-requestid": "aws_req_1" } }));
		const executor: any = await executeBedrock(executorArgs("messages", "amazon-bedrock", "anthropic.claude-sonnet-4-6", true));
		const { nanos } = await runStream({ endpoint: "messages", provider: "amazon-bedrock", model: "anthropic/claude-sonnet-4-6", card, executor });
		report("bedrock messages streamed", nanos, expected);
		expect(nanos).toBe(expected);
	});
});

describe("Claude on Vertex", () => {
	const card = textCard("google-vertex", "anthropic/claude-sonnet-4-6", sonnetPrices);
	const expected = expectedCost(claudeTokens, sonnetPrices);
	const withVertexRuntime = async (run: () => Promise<void>) => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "test-project", GOOGLE_VERTEX_ACCESS_TOKEN: "test-token" } as any);
		try { await run(); } finally { teardownTestRuntime(); setupTestRuntime(); }
	};

	for (const endpoint of ["chat.completions", "responses"] as const) {
		it(`bills cache writes for a non-Opus model on ${endpoint} (buffered SSE)`, async () => withVertexRuntime(async () => {
			stubFetch(() => new Response(claudeSse(), { headers: { "content-type": "text/event-stream" } }));
			const executor = await asCompleted(await executeVertex(executorArgs(endpoint, "google-vertex", "claude-sonnet-4-6", false)));
			const { nanos, usage } = await runNonStream({ endpoint, provider: "google-vertex", model: "anthropic/claude-sonnet-4-6", card, executor });
			report(`vertex ${endpoint} buffered`, nanos, expected);
			expect(nanos).toBe(expected);
			expectOpenAIClientUsage(endpoint, usage, claudeTokens);
		}));

		it(`bills cache writes for a non-Opus model on ${endpoint} (buffered JSON)`, async () => withVertexRuntime(async () => {
			stubFetch(() => Response.json(claudeMessage()));
			const executor = await asCompleted(await executeVertex(executorArgs(endpoint, "google-vertex", "claude-sonnet-4-6", false)));
			const { nanos } = await runNonStream({ endpoint, provider: "google-vertex", model: "anthropic/claude-sonnet-4-6", card, executor });
			report(`vertex ${endpoint} buffered json`, nanos, expected);
			expect(nanos).toBe(expected);
		}));

		it(`bills cache writes for a non-Opus model on ${endpoint} (streamed)`, async () => withVertexRuntime(async () => {
			stubFetch(() => new Response(claudeSse(), { headers: { "content-type": "text/event-stream" } }));
			const executor: any = await executeVertex(executorArgs(endpoint, "google-vertex", "claude-sonnet-4-6", true));
			const { nanos } = await runStream({ endpoint, provider: "google-vertex", model: "anthropic/claude-sonnet-4-6", card, executor });
			report(`vertex ${endpoint} streamed`, nanos, expected);
			expect(nanos).toBe(expected);
		}));
	}
});

// ---------------------------------------------------------------------------------------
// OpenAI-compatible families. Each uses the provider's documented usage shape.
// ---------------------------------------------------------------------------------------

type CompatCase = {
	name: string;
	provider: string;
	model: string;
	prices: TokenPrices;
	tokens: Tokens;
	/** Chat Completions usage as the provider returns it. */
	chatUsage: Record<string, unknown>;
	/** Responses usage, for providers served on /responses upstream. */
	responsesUsage?: Record<string, unknown>;
};

const compatCases: CompatCase[] = [
	{
		// GPT-5.6+: cache_write_tokens is part of input_tokens (OpenAI prompt caching guide).
		name: "OpenAI GPT-5.6",
		provider: "openai",
		model: "openai/gpt-5.6-sol",
		prices: { input: "5", output: "30", cachedRead: "0.5", cachedWrite: "6.25" },
		tokens: { uncached: 2_100, read: 48_000, write: 3_000, output: 850 },
		chatUsage: { prompt_tokens: 53_100, completion_tokens: 850, total_tokens: 53_950, prompt_tokens_details: { cached_tokens: 48_000, cache_write_tokens: 3_000 }, completion_tokens_details: { reasoning_tokens: 0 } },
		responsesUsage: { input_tokens: 53_100, output_tokens: 850, total_tokens: 53_950, input_tokens_details: { cached_tokens: 48_000, cache_write_tokens: 3_000 }, output_tokens_details: { reasoning_tokens: 0 } },
	},
	{
		// More uncached input than cache, so subtracting the cache twice still looks possible.
		name: "OpenAI GPT-5.6, mostly uncached prompt",
		provider: "openai",
		model: "openai/gpt-5.6-sol",
		prices: { input: "5", output: "30", cachedRead: "0.5", cachedWrite: "6.25" },
		tokens: { uncached: 80_000, read: 20_011, write: 3_000, output: 850 },
		chatUsage: { prompt_tokens: 103_011, completion_tokens: 850, total_tokens: 103_861, prompt_tokens_details: { cached_tokens: 20_011, cache_write_tokens: 3_000 } },
		responsesUsage: { input_tokens: 103_011, output_tokens: 850, total_tokens: 103_861, input_tokens_details: { cached_tokens: 20_011, cache_write_tokens: 3_000 } },
	},
	{
		// Alibaba explicit cache: prompt_tokens includes cached_tokens and cache_creation_input_tokens.
		name: "Alibaba Qwen explicit cache",
		provider: "alibaba-cloud",
		model: "qwen/qwen3.8-max",
		prices: { input: "1.2", output: "6", cachedRead: "0.12", cachedWrite: "1.5" },
		tokens: { uncached: 2_100, read: 48_000, write: 3_000, output: 850 },
		chatUsage: { prompt_tokens: 53_100, completion_tokens: 850, total_tokens: 53_950, prompt_tokens_details: { cached_tokens: 48_000, cache_creation_input_tokens: 3_000, cache_type: "ephemeral" } },
	},
	{
		// Kimi K3: prompt_tokens_details.cache_write_tokens inside prompt_tokens.
		name: "Kimi K3",
		provider: "moonshotai",
		model: "moonshotai/kimi-k3",
		prices: { input: "3", output: "15", cachedRead: "0.3", cachedWrite: "3" },
		tokens: { uncached: 2_100, read: 48_000, write: 3_000, output: 850 },
		chatUsage: { prompt_tokens: 53_100, completion_tokens: 850, total_tokens: 53_950, prompt_tokens_details: { cached_tokens: 48_000, cache_write_tokens: 3_000 } },
	},
	{
		// Venice: writes reported as prompt_tokens_details.cache_creation_input_tokens, inside prompt_tokens.
		name: "Venice Claude",
		provider: "venice",
		model: "anthropic/claude-sonnet-4-6",
		prices: { input: "3.6", output: "18", cachedRead: "0.36", cachedWrite: "4.5" },
		tokens: { uncached: 2_100, read: 48_000, write: 3_000, output: 850 },
		chatUsage: { prompt_tokens: 53_100, completion_tokens: 850, total_tokens: 53_950, prompt_tokens_details: { cached_tokens: 48_000, cache_creation_input_tokens: 3_000 } },
	},
	{
		// DeepSeek: prompt_tokens = prompt_cache_hit_tokens + prompt_cache_miss_tokens.
		name: "DeepSeek",
		provider: "deepseek",
		model: "deepseek/deepseek-v4-flash",
		prices: { input: "0.28", output: "0.42", cachedRead: "0.028" },
		tokens: { uncached: 3_000, read: 48_000, output: 850 },
		chatUsage: { prompt_tokens: 51_000, completion_tokens: 850, total_tokens: 51_850, prompt_cache_hit_tokens: 48_000, prompt_cache_miss_tokens: 3_000 },
	},
	{
		// StepFun: top-level cached_tokens inside prompt_tokens.
		name: "StepFun",
		provider: "stepfun",
		model: "stepfun/step-3.5",
		prices: { input: "0.8", output: "4", cachedRead: "0.16" },
		tokens: { uncached: 3_000, read: 48_000, output: 850 },
		chatUsage: { prompt_tokens: 51_000, completion_tokens: 850, total_tokens: 51_850, cached_tokens: 48_000 },
	},
];

function chatJson(usage: Record<string, unknown>, model: string) {
	return {
		id: "chatcmpl_cache", object: "chat.completion", created: 1_760_000_000, model,
		choices: [{ index: 0, message: { role: "assistant", content: "Edited the file." }, finish_reason: "stop" }],
		usage,
	};
}

function chatSse(usage: Record<string, unknown>, model: string): Response {
	return sse([
		{ data: { id: "chatcmpl_cache", object: "chat.completion.chunk", created: 1_760_000_000, model, choices: [{ index: 0, delta: { role: "assistant", content: "Edited the file." }, finish_reason: null }] } },
		{ data: { id: "chatcmpl_cache", object: "chat.completion.chunk", created: 1_760_000_000, model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] } },
		{ data: { id: "chatcmpl_cache", object: "chat.completion.chunk", created: 1_760_000_000, model, choices: [], usage } },
	], true);
}

function responsesSse(usage: Record<string, unknown>, model: string): Response {
	const response = {
		id: "resp_cache", object: "response", created_at: 1_760_000_000, status: "completed", model,
		output: [{ type: "message", id: "msg_1", status: "completed", role: "assistant", content: [{ type: "output_text", text: "Edited the file.", annotations: [] }] }],
		usage,
	};
	return sse([
		{ event: "response.created", data: { type: "response.created", response: { ...response, status: "in_progress", output: [], usage: null } } },
		{ event: "response.output_text.delta", data: { type: "response.output_text.delta", item_id: "msg_1", output_index: 0, delta: "Edited the file." } },
		{ event: "response.completed", data: { type: "response.completed", response } },
	]);
}

describe.each(compatCases)("$name", (testCase) => {
	const card = textCard(testCase.provider, testCase.model, testCase.prices);
	const expected = expectedCost(testCase.tokens, testCase.prices);

	// Messages clients get Anthropic usage (input without the cache) while the executor's bill
	// keeps the provider's OpenAI-style usage; the after-stage merges both before pricing.
	for (const endpoint of ["chat.completions", "responses", "messages"] as const) {
		it(`bills each cache meter once on ${endpoint} (buffered)`, async () => {
			let executor: { ir: any; bill: any; rawResponse?: any };
			if (testCase.responsesUsage) {
				const buffered = await bufferStreamToIR(
					responsesSse(testCase.responsesUsage, testCase.model),
					executorArgs(endpoint, testCase.provider, testCase.model, false),
					"responses",
					Date.now(),
				);
				executor = { ir: buffered.ir, bill: { usage: normalizeTextUsageForPricing(buffered.ir?.usage ?? buffered.usage) }, rawResponse: buffered.rawResponse };
			} else {
				const json = chatJson(testCase.chatUsage, testCase.model);
				const ir = openAIChatToIR(json, "req_cache_billing", testCase.model, testCase.provider);
				executor = { ir, bill: { usage: normalizeTextUsageForPricing(ir?.usage ?? json.usage) }, rawResponse: json };
			}
			const { nanos, usage } = await runNonStream({ endpoint, provider: testCase.provider, model: testCase.model, card, executor });
			report(`${testCase.name} ${endpoint} buffered`, nanos, expected);
			expect(nanos).toBe(expected);
			expectOpenAIClientUsage(endpoint, usage, testCase.tokens);
		});

		it(`bills each cache meter once on ${endpoint} (streamed)`, async () => {
			const route = testCase.responsesUsage ? "responses" : "chat";
			const upstream = route === "responses"
				? responsesSse(testCase.responsesUsage!, testCase.model)
				: chatSse(testCase.chatUsage, testCase.model);
			const stream = resolveStreamForProtocol(upstream, executorArgs(endpoint, testCase.provider, testCase.model, true), route);
			const { nanos, usage } = await runStream({ endpoint, provider: testCase.provider, model: testCase.model, card, executor: { stream } });
			report(`${testCase.name} ${endpoint} streamed`, nanos, expected);
			expect(nanos).toBe(expected);
			expectOpenAIClientUsage(endpoint, usage, testCase.tokens);
		});
	}
});

// ---------------------------------------------------------------------------------------
// Gemini on AI Studio: promptTokenCount includes cachedContentTokenCount. 3.1 Pro Preview
// has no cached-read row in the catalogue, so hits bill at the input rate (fallback).
// ---------------------------------------------------------------------------------------

describe.each([
	{
		prompt: "a mostly cached prompt",
		usageMetadata: { promptTokenCount: 51_000, cachedContentTokenCount: 48_000, candidatesTokenCount: 850, totalTokenCount: 51_850 },
		tokens: { uncached: 3_000, read: 48_000, output: 850 } as Tokens,
	},
	{
		// More uncached input than cache reads, so subtracting the reads twice still looks possible.
		prompt: "a mostly uncached prompt",
		usageMetadata: { promptTokenCount: 100_003, cachedContentTokenCount: 20_011, candidatesTokenCount: 850, totalTokenCount: 100_853 },
		tokens: { uncached: 79_992, read: 20_011, output: 850 } as Tokens,
	},
])("Gemini on AI Studio with $prompt", ({ usageMetadata, tokens }) => {
	const cases = [
		{ name: "with a cached-read row", prices: { input: "0.5", output: "3", cachedRead: "0.05" } as TokenPrices },
		{ name: "without a cached-read row (input-rate fallback)", prices: { input: "2", output: "12" } as TokenPrices },
	];

	for (const { name, prices } of cases) {
		const card = textCard("google-ai-studio", "google/gemini-3.1-pro-preview", prices);
		const expected = expectedCost(tokens, prices);

		for (const endpoint of ["chat.completions", "responses", "messages"] as const) {
			it(`bills implicit cache hits ${name} on ${endpoint} (buffered)`, async () => {
				const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
				const irUsage = googleUsageMetadataToIRUsage(usageMetadata as any);
				const ir = {
					id: "req_cache_billing", nativeId: "gemini_1", created: 1_760_000_000, model: "gemini-3.1-pro-preview", provider: "google-ai-studio",
					choices: [{ index: 0, message: { role: "assistant", content: [{ type: "text", text: "Edited the file." }] }, finishReason: "stop" }],
					usage: irUsage,
				};
				const { nanos, usage } = await runNonStream({
					endpoint, provider: "google-ai-studio", model: "google/gemini-3.1-pro-preview", card,
					executor: { ir, bill: { usage: normalizeTextUsageForPricing(irUsage) } },
				});
				warn.mockRestore();
				report(`gemini ${name} ${endpoint} buffered`, nanos, expected);
				expect(nanos).toBe(expected);
				expectOpenAIClientUsage(endpoint, usage, tokens);
			});

			it(`bills implicit cache hits ${name} on ${endpoint} (streamed)`, async () => {
				const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
				const upstream = sse([
					{ data: { candidates: [{ content: { role: "model", parts: [{ text: "Edited the file." }] }, index: 0 }], modelVersion: "gemini-3.1-pro-preview" } },
					{ data: { candidates: [{ content: { role: "model", parts: [{ text: "" }] }, finishReason: "STOP", index: 0 }], usageMetadata, modelVersion: "gemini-3.1-pro-preview" } },
				]);
				const stream = transformGeminiStream(upstream.body!, executorArgs(endpoint, "google-ai-studio", "gemini-3.1-pro-preview", true));
				const { nanos } = await runStream({ endpoint, provider: "google-ai-studio", model: "google/gemini-3.1-pro-preview", card, executor: { stream } });
				warn.mockRestore();
				report(`gemini ${name} ${endpoint} streamed`, nanos, expected);
				expect(nanos).toBe(expected);
			});
		}
	}
});

// ---------------------------------------------------------------------------------------
// A 40-step agent turn on Claude Sonnet: 30k-token tool prompt cached once (5m), each step
// appends ~1.5k tokens (written) and reads the whole prefix. Billed per step, streamed.
// ---------------------------------------------------------------------------------------

describe("40-step Claude agent turn", () => {
	it("bills the provider's cost for every step", async () => {
		const card = textCard("anthropic", "anthropic/claude-sonnet-4-6", sonnetPrices);
		let charged = 0;
		let expectedTotal = 0;
		for (let step = 0; step < 40; step++) {
			const usage = step === 0
				? { input_tokens: 40, cache_creation_input_tokens: 30_000, cache_read_input_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: 30_000, ephemeral_1h_input_tokens: 0 }, output_tokens: 600 }
				: { input_tokens: 40, cache_creation_input_tokens: 1_500, cache_read_input_tokens: 30_000 + (step - 1) * 1_500, cache_creation: { ephemeral_5m_input_tokens: 1_500, ephemeral_1h_input_tokens: 0 }, output_tokens: 600 };
			expectedTotal += expectedCost({ uncached: usage.input_tokens, read: usage.cache_read_input_tokens, write5m: usage.cache_creation_input_tokens, output: usage.output_tokens }, sonnetPrices);
			const body = [
				{ event: "message_start", data: { type: "message_start", message: { id: `msg_${step}`, type: "message", role: "assistant", model: "claude-sonnet-4-6", content: [], stop_reason: null, usage: { ...usage, output_tokens: 1 } } } },
				{ event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
				{ event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } } },
				{ event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
				{ event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: usage.output_tokens } } },
				{ event: "message_stop", data: { type: "message_stop" } },
			].map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
			stubFetch(() => new Response(body, { headers: { "content-type": "text/event-stream" } }));
			const executor: any = await executeAnthropic(executorArgs("responses", "anthropic", "claude-sonnet-4-6", true));
			mocks.charge.mockClear();
			const { nanos } = await runStream({ endpoint: "responses", provider: "anthropic", model: "anthropic/claude-sonnet-4-6", card, executor });
			charged += nanos;
		}
		report("anthropic 40-step agent turn", charged, expectedTotal);
		expect(charged).toBe(expectedTotal);
	});
});
