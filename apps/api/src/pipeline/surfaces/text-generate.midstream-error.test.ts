import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timer } from "../telemetry/timer";
import { runTextGeneratePipeline, settleBufferedUpstreamStreamFailure } from "./text-generate";
import { mergeIRUsageTotals } from "./server-tools";
import { UpstreamStreamError } from "@core/stream-errors";

const mocks = vi.hoisted(() => ({
	doRequestWithIR: vi.fn(),
	finalizeRequest: vi.fn(),
	handleFailureAudit: vi.fn(),
	handleSuccessAudit: vi.fn(),
	consume: vi.fn(),
	recordManagedProviderTokensOnce: vi.fn(),
	handleError: vi.fn(),
}));

vi.mock("@protocols/detect", () => ({ detectTextProtocol: () => "openai.chat.completions" }));
vi.mock("@protocols/index", () => ({
	decodeProtocol: () => ({ stream: false, messages: [{ role: "user", content: "hello" }] }),
	encodeProtocol: () => ({}),
}));
vi.mock("../execute", () => ({ doRequestWithIR: (...args: any[]) => mocks.doRequestWithIR(...args) }));
vi.mock("../after", () => ({
	finalizeRequest: (...args: any[]) => mocks.finalizeRequest(...args),
	settleNonBillableFailure: vi.fn(),
}));
vi.mock("../after/audit", () => ({
	handleFailureAudit: (...args: any[]) => mocks.handleFailureAudit(...args),
	handleSuccessAudit: (...args: any[]) => mocks.handleSuccessAudit(...args),
}));
vi.mock("@core/error-handler", () => ({ handleError: (args: any) => mocks.handleError(args) }));
vi.mock("@core/provider-rate-limits", () => ({
	recordManagedProviderTokensOnce: (...args: any[]) => mocks.recordManagedProviderTokensOnce(...args),
}));
vi.mock("@/runtime/env", () => ({
	getResponseCache: () => null,
	ensureRuntimeForBackground: () => () => {},
	dispatchBackground: () => {},
}));
vi.mock("../text-ir-contract", () => ({
	validateTextIRContract: () => [],
	buildTextIRContractErrorResponse: () => new Response(null, { status: 400 }),
}));
vi.mock("./server-tools", () => ({
	prepareServerToolsForTextRequest: (body: any) => ({ ok: true, body, config: { enabled: false } }),
	attachServerToolUsage: vi.fn(),
	attachServerToolUsageToRawUsage: vi.fn(),
	buildSyntheticServerToolStream: vi.fn(),
	buildServerToolContinuation: vi.fn(),
	consumeTextProtocolStreamToIR: (...args: any[]) => mocks.consume(...args),
	mergeIRUsageTotals: vi.fn(),
}));

function args() {
	return {
		pre: {
			ok: true as const,
			ctx: {
				endpoint: "chat.completions",
				capability: "text.generate",
				requestId: "req_midstream",
				protocol: "openai.chat.completions",
				meta: {},
				rawBody: { model: "openai/gpt-oss-120b", messages: [] },
				body: { model: "openai/gpt-oss-120b", messages: [] },
				model: "openai/gpt-oss-120b",
				workspaceId: "ws_123",
				stream: false,
				providers: [],
				pricing: {},
				teamSettings: {},
			} as any,
		},
		req: new Request("https://example.com/v1/chat/completions", { method: "POST" }),
		endpoint: "chat.completions" as const,
		timing: { timer: new Timer(), internal: { adapterMarked: false } },
	};
}

describe("buffered text request whose upstream stream fails after output began", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.handleError.mockImplementation(async ({ res }: { res: Response }) => res);
		mocks.doRequestWithIR.mockResolvedValue({
			result: {
				kind: "stream",
				stream: new ReadableStream({ start: (controller) => controller.close() }),
				upstream: new Response(null, { status: 200 }),
				provider: "deepinfra",
				keySource: "gateway",
				providerRateLimitReservation: null,
				bill: { cost_cents: 0, currency: "USD" },
			},
		});
		mocks.consume.mockRejectedValue(new UpstreamStreamError("upstream reset", {
			ir: {
				id: "ir_partial",
				model: "openai/gpt-oss-120b",
				choices: [{ index: 0, message: { role: "assistant", content: [{ type: "text", text: "partial" }] }, finishReason: null }],
			} as any,
			rawResponse: null,
			usageRaw: { prompt_tokens: 12, completion_tokens: 3 },
		}));
	});

	it("returns a 502 upstream_stream_failure instead of a 200 with the partial text", async () => {
		const response = await runTextGeneratePipeline(args() as any);

		expect(response.status).toBe(502);
		const body = await response.json();
		expect(body).toMatchObject({ error: "upstream_stream_failure", error_origin: "upstream" });
		expect(JSON.stringify(body)).not.toContain("partial");
		expect(mocks.finalizeRequest).not.toHaveBeenCalled();
		expect(mocks.handleSuccessAudit).not.toHaveBeenCalled();
	});

	it("audits one failure with the partial usage and no charge, and counts the tokens against provider limits", async () => {
		await runTextGeneratePipeline(args() as any);

		expect(mocks.handleFailureAudit).toHaveBeenCalledOnce();
		const [, result, status, attribution, code] = mocks.handleFailureAudit.mock.calls[0]!;
		expect({ status, attribution, code }).toEqual({ status: 502, attribution: "upstream", code: "upstream_stream_failure" });
		expect(result.bill.cost_cents).toBe(0);
		expect(result.bill.usage).toMatchObject({
			pricing: { total_nanos: 0, billing_suppressed: true, billing_suppression_reason: "upstream_failure" },
		});
		expect(mocks.recordManagedProviderTokensOnce).toHaveBeenCalledWith(expect.objectContaining({
			providerId: "deepinfra",
			usage: { prompt_tokens: 12, completion_tokens: 3 },
		}));
		// handleError must not write a second failure audit.
		const handleErrorArgs = mocks.handleError.mock.calls[0]![0];
		const auditSpy = vi.fn();
		await handleErrorArgs.auditFailure(auditSpy);
		expect(auditSpy).not.toHaveBeenCalled();
	});

	it("settles a failed server-tool follow-up with the earlier rounds' usage too", async () => {
		vi.mocked(mergeIRUsageTotals).mockImplementation(((a: any, b: any) => ({
			inputTokens: (a?.inputTokens ?? 0) + (b?.inputTokens ?? 0),
			outputTokens: (a?.outputTokens ?? 0) + (b?.outputTokens ?? 0),
			totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
		})) as any);
		const partial = { usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 }, choices: [] };
		const error = new UpstreamStreamError("upstream reset", { ir: partial as any, rawResponse: null, usageRaw: { prompt_tokens: 12, completion_tokens: 3 } });
		const result = { provider: "deepinfra", keySource: "gateway", providerRateLimitReservation: null, bill: { cost_cents: 0, currency: "USD" } };
		const earlierRounds = { inputTokens: 400, outputTokens: 60, totalTokens: 460 };

		const response = await settleBufferedUpstreamStreamFailure(args().pre.ctx, result, error, earlierRounds);

		expect(response.status).toBe(502);
		expect(mergeIRUsageTotals).toHaveBeenCalledWith(earlierRounds, partial.usage);
		expect(mocks.recordManagedProviderTokensOnce).toHaveBeenCalledWith(expect.objectContaining({
			usage: { inputTokens: 412, outputTokens: 63, totalTokens: 475 },
		}));
	});

	it("keeps the generic materialisation error for other stream failures", async () => {
		mocks.consume.mockRejectedValue(new Error("malformed"));

		const response = await runTextGeneratePipeline(args() as any);

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ error: "gateway_stream_materialization_error" });
		expect(mocks.handleFailureAudit).not.toHaveBeenCalled();
	});
});
