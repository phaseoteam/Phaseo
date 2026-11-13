import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";

const mocks = vi.hoisted(() => ({
	doRequestWithIR: vi.fn(),
	finalizeRequest: vi.fn(),
	handleError: vi.fn(),
	fetchGatewayContext: vi.fn(),
	buildCandidates: vi.fn(),
	priceServerToolSubCall: vi.fn(),
	chargeCompletedServerToolRounds: vi.fn(),
	priceServerToolRounds: vi.fn(async () => null),
	settleNonBillableFailure: vi.fn(),
	bindings: {} as Record<string, string>,
}));

vi.mock("../execute", () => ({ doRequestWithIR: (...args: any[]) => mocks.doRequestWithIR(...args) }));
vi.mock("../after", () => ({
	finalizeRequest: (...args: any[]) => mocks.finalizeRequest(...args),
	settleNonBillableFailure: (...args: any[]) => mocks.settleNonBillableFailure(...args),
}));
vi.mock("../after/audit", () => ({ handleFailureAudit: vi.fn(), handleSuccessAudit: vi.fn() }));
vi.mock("../audit", () => ({ auditFailure: vi.fn() }));
vi.mock("@core/error-handler", () => ({ handleError: (args: any) => mocks.handleError(args) }));
vi.mock("@/runtime/env", () => ({
	getResponseCache: () => null,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: () => {},
	getBindings: () => mocks.bindings,
}));
vi.mock("../before/context", () => ({ fetchGatewayContext: (...args: any[]) => mocks.fetchGatewayContext(...args) }));
vi.mock("../before/utils", () => ({ buildProviderCandidatesWithDiagnostics: (...args: any[]) => mocks.buildCandidates(...args) }));
vi.mock("../after/server-tool-charges", () => ({
	priceServerToolSubCall: (...args: any[]) => mocks.priceServerToolSubCall(...args),
	chargeCompletedServerToolRounds: (...args: any[]) => mocks.chargeCompletedServerToolRounds(...args),
	priceServerToolRounds: (...args: any[]) => mocks.priceServerToolRounds(...args),
	recordsServerToolAccounting: () => false,
}));
// The policy read is faked (no rules); applyWorkspacePolicy is the real function.
vi.mock("../before/workspacePolicy", async (importOriginal) => ({
	...(await importOriginal<typeof import("../before/workspacePolicy")>()),
	fetchWorkspacePolicy: async () => null,
}));

import { runTextGeneratePipeline } from "./text-generate";

const ADVISOR_MODEL = "anthropic/claude-opus-5.5";

function priceCard(price: string) {
	return {
		provider: "anthropic",
		model: ADVISOR_MODEL,
		endpoint: "text.generate",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: [{ pricing_plan: "standard", meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: price, currency: "USD", match: [], priority: 100 }],
	};
}

function completed(args: { text?: string; toolCalls?: any[]; usage: { inputTokens: number; outputTokens: number } }) {
	return {
		result: {
			kind: "completed",
			provider: "google-ai-studio",
			apiModelId: "google/gemma-4-31b:free",
			upstream: new Response(null, { status: 200 }),
			generationTimeMs: 1,
			bill: { cost_cents: 0, currency: "USD", usage: {} },
			ir: {
				id: "resp",
				model: "google/gemma-4-31b:free",
				provider: "google-ai-studio",
				choices: [{
					index: 0,
					message: {
						role: "assistant",
						content: args.text ? [{ type: "text", text: args.text }] : [],
						...(args.toolCalls ? { toolCalls: args.toolCalls } : {}),
					},
					finishReason: args.toolCalls ? "tool_calls" : "stop",
				}],
				usage: { ...args.usage, totalTokens: args.usage.inputTokens + args.usage.outputTokens },
			},
		},
	};
}

const advisorCall = (id: string) => ({ id, name: "phaseo_advisor", arguments: JSON.stringify({ prompt: "Review my plan." }) });

function pipelineArgs(options: { stream?: boolean; creditOk?: boolean; maxToolCalls?: number; tools?: unknown[] } = {}) {
	const body: Record<string, unknown> = {
		model: "google/gemma-4-31b:free",
		messages: [{ role: "user", content: "Plan a launch." }],
		tools: options.tools ?? [{ type: "phaseo:advisor", model: ADVISOR_MODEL, max_uses: 8, max_tokens: 32000 }],
		...(options.stream ? { stream: true } : {}),
		...(options.maxToolCalls ? { max_tool_calls: options.maxToolCalls } : {}),
	};
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "chat.completions",
				capability: "text.generate",
				requestId: "req_tool_billing",
				billingRequestId: "bill_tool_billing",
				protocol: "openai.chat.completions",
				meta: {},
				rawBody: JSON.parse(JSON.stringify(body)),
				body: JSON.parse(JSON.stringify(body)),
				model: "google/gemma-4-31b:free",
				workspaceId: "ws_free",
				keyId: "key_1",
				stream: options.stream === true,
				providers: [],
				pricing: {},
				gating: {
					key: { ok: true, reason: null, resetAt: null },
					keyLimit: { ok: true, reason: null, resetAt: null },
					credit: { ok: options.creditOk !== false, reason: options.creditOk === false ? "insufficient_funds" : null, resetAt: null },
				},
				internal: false,
				teamSettings: { billingMode: "wallet" },
			} as any,
		},
		req: new Request("https://example.com/v1/chat/completions", { method: "POST" }),
		endpoint: "chat.completions" as const,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

describe("server tools bill their model calls and completed rounds", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.unstubAllGlobals();
		mocks.bindings = {};
		mocks.finalizeRequest.mockImplementation(async ({ exec }: any) =>
			exec.result.stream
				? new Response(exec.result.stream, { status: 200 })
				: new Response(JSON.stringify({ ok: true }), { status: 200 }));
		mocks.handleError.mockImplementation(async ({ res }: any) => res);
		mocks.priceServerToolSubCall.mockImplementation(async ({ kind, model, result }: any) => ({
			kind, model, provider: result.provider, keySource: "gateway", totalNanos: 710_000_000, currency: "USD",
		}));
		mocks.chargeCompletedServerToolRounds.mockResolvedValue(0);
	});

	function setAdvisorContext(args: { creditOk: boolean; advisorPrice: string }) {
		mocks.fetchGatewayContext.mockResolvedValue({
			resolvedModel: ADVISOR_MODEL,
			pricing: { "anthropic:anthropic/claude-opus-5.5": priceCard(args.advisorPrice) },
			key: { ok: true },
			keyLimit: { ok: true },
			credit: { ok: args.creditOk, reason: args.creditOk ? null : "insufficient_funds" },
			teamSettings: { billingMode: "wallet" },
		});
		mocks.buildCandidates.mockReturnValue({
			candidates: [{ providerId: "anthropic", pricingCard: priceCard(args.advisorPrice) }],
			diagnostics: {},
		});
	}

	function routeRounds(mainRounds: any[]) {
		let main = 0;
		mocks.doRequestWithIR.mockImplementation(async (ctx: any) => {
			if (String(ctx.requestId).endsWith(":advisor")) {
				return { result: { ...completed({ text: "Ship it.", usage: { inputTokens: 2_000, outputTokens: 28_000 } }).result, provider: "anthropic", apiModelId: ADVISOR_MODEL } };
			}
			const next = mainRounds[main++];
			return typeof next === "function" ? next() : next;
		});
	}

	it("prices an advisor call on its own model's route and keeps its tokens out of the main usage", async () => {
		setAdvisorContext({ creditOk: true, advisorPrice: "25" });
		routeRounds([
			completed({ toolCalls: [advisorCall("call_1")], usage: { inputTokens: 100, outputTokens: 20 } }),
			completed({ text: "Done.", usage: { inputTokens: 150, outputTokens: 30 } }),
		]);
		const args = pipelineArgs();

		const response = await runTextGeneratePipeline(args);

		expect(response.status).toBe(200);
		expect(mocks.priceServerToolSubCall).toHaveBeenCalledOnce();
		const priced = mocks.priceServerToolSubCall.mock.calls[0]![0];
		expect(priced).toMatchObject({ kind: "advisor", model: ADVISOR_MODEL });
		// Priced on the advisor's own price cards, not the free main model's.
		expect(Object.keys(priced.ctx.pricing)).toEqual(["anthropic:anthropic/claude-opus-5.5"]);
		const finalized = mocks.finalizeRequest.mock.calls[0]![0];
		expect(finalized.pre.ctx.serverToolSubCallCharges).toEqual([
			expect.objectContaining({ kind: "advisor", model: ADVISOR_MODEL, totalNanos: 710_000_000 }),
		]);
		// Two main rounds only; the advisor's 30,000 tokens are not the free model's.
		expect(finalized.exec.result.ir.usage).toMatchObject({ inputTokens: 250, outputTokens: 50 });
	});

	it("refuses a paid advisor model when the wallet cannot pay, even behind a free main model", async () => {
		setAdvisorContext({ creditOk: false, advisorPrice: "25" });
		routeRounds([
			completed({ toolCalls: [advisorCall("call_1")], usage: { inputTokens: 100, outputTokens: 20 } }),
			completed({ text: "Done.", usage: { inputTokens: 150, outputTokens: 30 } }),
		]);

		await runTextGeneratePipeline(pipelineArgs({ creditOk: false }));

		const advisorCalls = mocks.doRequestWithIR.mock.calls.filter(([ctx]: any[]) => String(ctx.requestId).endsWith(":advisor"));
		expect(advisorCalls).toHaveLength(0);
		const followUp = mocks.doRequestWithIR.mock.calls[1]![1];
		const toolMessage = followUp.messages.at(-1);
		expect(toolMessage.role).toBe("tool");
		expect(String(toolMessage.toolResults[0].content)).toContain("Insufficient credits");
		expect(mocks.priceServerToolSubCall).not.toHaveBeenCalled();
	});

	it("still runs a free advisor model from an empty wallet", async () => {
		setAdvisorContext({ creditOk: false, advisorPrice: "0" });
		routeRounds([
			completed({ toolCalls: [advisorCall("call_1")], usage: { inputTokens: 100, outputTokens: 20 } }),
			completed({ text: "Done.", usage: { inputTokens: 150, outputTokens: 30 } }),
		]);

		await runTextGeneratePipeline(pipelineArgs({ creditOk: false }));

		const advisorCalls = mocks.doRequestWithIR.mock.calls.filter(([ctx]: any[]) => String(ctx.requestId).endsWith(":advisor"));
		expect(advisorCalls).toHaveLength(1);
	});

	it("charges the completed round when the request then exceeds max_tool_calls", async () => {
		setAdvisorContext({ creditOk: true, advisorPrice: "25" });
		routeRounds([
			completed({ toolCalls: [advisorCall("call_1"), advisorCall("call_2")], usage: { inputTokens: 100, outputTokens: 20 } }),
		]);

		const response = await runTextGeneratePipeline(pipelineArgs({ maxToolCalls: 1 }));

		expect(response.status).toBe(400);
		expect(mocks.chargeCompletedServerToolRounds).toHaveBeenCalledOnce();
		expect(mocks.chargeCompletedServerToolRounds.mock.calls[0]![0].usage).toMatchObject({ inputTokens: 100, outputTokens: 20 });
		expect(mocks.finalizeRequest).not.toHaveBeenCalled();
	});

	it("hands settlement each completed round with its own route, credential and usage", async () => {
		setAdvisorContext({ creditOk: true, advisorPrice: "25" });
		const onRoute = (round: ReturnType<typeof completed>, provider: string, keySource: "gateway" | "byok") =>
			({ result: { ...round.result, provider, keySource } });
		routeRounds([
			onRoute(completed({ toolCalls: [advisorCall("call_1")], usage: { inputTokens: 100, outputTokens: 20 } }), "openai", "byok"),
			onRoute(completed({ toolCalls: [advisorCall("call_2")], usage: { inputTokens: 150, outputTokens: 30 } }), "anthropic", "gateway"),
			() => new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 }),
		]);

		await runTextGeneratePipeline(pipelineArgs());

		const { rounds } = mocks.chargeCompletedServerToolRounds.mock.calls[0]![0];
		expect(rounds.map((round: any) => [round.result.provider, round.result.keySource, round.usage.inputTokens])).toEqual([
			["openai", "byok", 100],
			["anthropic", "gateway", 150],
		]);
	});

	it.each([false, true])("charges completed rounds and sub-calls when a follow-up fails (stream: %s)", async (stream) => {
		setAdvisorContext({ creditOk: true, advisorPrice: "25" });
		routeRounds([
			completed({ toolCalls: [advisorCall("call_1")], usage: { inputTokens: 100, outputTokens: 20 } }),
			completed({ toolCalls: [advisorCall("call_2")], usage: { inputTokens: 150, outputTokens: 30 } }),
			() => new Response(JSON.stringify({ error: "upstream_error" }), { status: 502 }),
		]);
		const args = pipelineArgs({ stream });

		const response = await runTextGeneratePipeline(args);
		await response.text();

		expect(mocks.chargeCompletedServerToolRounds).toHaveBeenCalledOnce();
		const charged = mocks.chargeCompletedServerToolRounds.mock.calls[0]![0];
		// Both completed rounds, with the two advisor calls billed as sub-calls on the context.
		expect(charged.usage).toMatchObject({ inputTokens: 250, outputTokens: 50 });
		expect(charged.ctx.serverToolSubCallCharges).toHaveLength(2);
		expect(mocks.finalizeRequest).not.toHaveBeenCalled();
	});

	const searchCall = (id: string) => ({ id, name: "phaseo_web_search", arguments: JSON.stringify({ query: "phaseo launch" }) });
	const exaResults = () => new Response(JSON.stringify({ requestId: "exa", results: [{ title: "Phaseo", url: "https://phaseo.app" }] }), {
		status: 200, headers: { "Content-Type": "application/json" },
	});

	it("does not run a paid managed search behind a free model when the wallet is empty", async () => {
		mocks.bindings = { EXA_API_KEY: "exa_key" };
		const fetchMock = vi.fn(async () => exaResults());
		vi.stubGlobal("fetch", fetchMock);
		routeRounds([
			completed({ toolCalls: [searchCall("call_1")], usage: { inputTokens: 100, outputTokens: 20 } }),
			completed({ text: "Done.", usage: { inputTokens: 150, outputTokens: 30 } }),
		]);

		await runTextGeneratePipeline(pipelineArgs({ creditOk: false, tools: [{ type: "phaseo:web_search" }] }));

		expect(fetchMock).not.toHaveBeenCalled();
		const toolMessage = mocks.doRequestWithIR.mock.calls[1]![1].messages.at(-1);
		expect(JSON.parse(String(toolMessage.toolResults[0].content))).toMatchObject({ error: "insufficient_credits", engine: "exa" });
	});

	it("runs no searches on the round past the last follow-up turn, so every search it ran is billed", async () => {
		mocks.bindings = { EXA_API_KEY: "exa_key" };
		const fetchMock = vi.fn(async () => exaResults());
		vi.stubGlobal("fetch", fetchMock);
		routeRounds(Array.from({ length: 12 }, (_, index) =>
			completed({ toolCalls: [searchCall(`call_${index}`)], usage: { inputTokens: 100, outputTokens: 20 } })));

		const response = await runTextGeneratePipeline(pipelineArgs({ tools: [{ type: "phaseo:web_search" }] }));

		expect(response.status).toBe(502);
		expect(mocks.chargeCompletedServerToolRounds).toHaveBeenCalledOnce();
		const billedSearches = mocks.chargeCompletedServerToolRounds.mock.calls[0]![0].toolMeters.server_tool_web_search_requests;
		// Eight follow-up turns: eight searches ran, and all eight are billed.
		expect(fetchMock).toHaveBeenCalledTimes(8);
		expect(billedSearches).toBe(8);
	});
});

describe("Anthropic Messages prompt-cache pre-warm (max_tokens: 0)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.finalizeRequest.mockImplementation(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
		mocks.handleError.mockImplementation(async ({ res }: any) => res);
	});

	it("returns the empty answer as a billable success instead of a 502", async () => {
		const body = {
			model: "anthropic/claude-sonnet-5.5",
			max_tokens: 0,
			system: [{ type: "text", text: "Long shared instructions", cache_control: { type: "ephemeral" } }],
			messages: [{ role: "user", content: "Warm the cache." }],
		};
		mocks.doRequestWithIR.mockResolvedValue({
			result: {
				kind: "completed",
				provider: "anthropic",
				apiModelId: "anthropic/claude-sonnet-5.5",
				upstream: new Response(null, { status: 200 }),
				generationTimeMs: 1,
				bill: { cost_cents: 0, currency: "USD", usage: { input_tokens: 12, output_tokens: 0, cache_creation_input_tokens: 4_000 } },
				ir: {
					id: "msg_warm",
					model: "anthropic/claude-sonnet-5.5",
					provider: "anthropic",
					choices: [{ index: 0, message: { role: "assistant", content: [] }, finishReason: "max_tokens" }],
					usage: { inputTokens: 12, outputTokens: 0, totalTokens: 12, _ext: { cachedWriteTokens: 4_000 } },
				},
			},
		});

		const response = await runTextGeneratePipeline({
			pre: {
				ok: true as const,
				ctx: {
					endpoint: "messages",
					capability: "text.generate",
					requestId: "req_warm",
					billingRequestId: "bill_warm",
					protocol: "anthropic.messages",
					meta: {},
					rawBody: structuredClone(body),
					body: structuredClone(body),
					model: "anthropic/claude-sonnet-5.5",
					workspaceId: "ws_1",
					stream: false,
					providers: [],
					pricing: {},
					gating: { key: { ok: true }, keyLimit: { ok: true }, credit: { ok: true } },
					teamSettings: { billingMode: "wallet" },
				} as any,
			},
			req: new Request("https://example.com/v1/messages", { method: "POST" }),
			endpoint: "messages" as const,
			timing: { timer: new Timer(), internal: { adapterMarked: false } },
		});

		expect(response.status).toBe(200);
		expect(mocks.settleNonBillableFailure).not.toHaveBeenCalled();
		expect(mocks.finalizeRequest).toHaveBeenCalledOnce();
		expect(mocks.finalizeRequest.mock.calls[0]![0].exec.result.bill.usage).toMatchObject({ cache_creation_input_tokens: 4_000 });
	});
});
