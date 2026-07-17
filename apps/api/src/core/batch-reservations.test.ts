import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPriceCardMock = vi.fn();
const reserveWalletCreditsMock = vi.fn();
const computeBillMock = vi.fn();

vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: (...args: any[]) => loadPriceCardMock(...args) }));
vi.mock("@pipeline/pricing/engine", () => ({ computeBill: (...args: any[]) => computeBillMock(...args) }));
vi.mock("@core/wallet-reservations", () => ({ reserveWalletCredits: (...args: any[]) => reserveWalletCreditsMock(...args) }));

import { estimateInputQuadTokens, estimateInputTokenUpperBound, reserveBatchCredits } from "./batch-reservations";

describe("batch credit reservations", () => {
	beforeEach(() => {
		loadPriceCardMock.mockReset().mockResolvedValue({ provider: "openai", model: "openai/gpt-4.1-mini", rules: [] });
		computeBillMock.mockReset().mockImplementation((usage: any) => ({ pricing: { total_nanos: usage.output_tokens * 1000 + usage.input_tokens } }));
		reserveWalletCreditsMock.mockReset().mockResolvedValue({ status: "held", applied: true, alreadyApplied: false });
	});

	it("reserves the summed conservative quote before submission", async () => {
		const firstBody = { model: "gpt-4.1-mini", input: "hello", max_output_tokens: 10 };
		const secondBody = { model: "gpt-4.1-mini", input: "world", max_output_tokens: 20 };
		const result = await reserveBatchCredits({
			workspaceId: "ws_1",
			apiKeyId: "key_1",
			requestId: "req_1",
			providerId: "openai",
			requests: [
				{ endpoint: "/v1/responses", body: firstBody },
				{ endpoint: "/v1/responses", body: secondBody },
			],
		});
		expect(result).toMatchObject({ reservationId: "batch_hold:req_1", held: true, status: "held" });
		expect(reserveWalletCreditsMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_1",
			keyId: "key_1",
			requestCount: 2,
			reservationId: "batch_hold:req_1",
			amountNanos: expect.any(Number),
		}));
		const firstInputUpperBound = estimateInputTokenUpperBound(firstBody);
		const secondInputUpperBound = estimateInputTokenUpperBound(secondBody);
		const expectedReservedNanos = Math.ceil((10_000 + firstInputUpperBound) * 1.1)
			+ Math.ceil((20_000 + secondInputUpperBound) * 1.1);
		expect(result.reservedNanos).toBe(expectedReservedNanos);
		expect(result.estimate).toEqual({
			strategy: "utf8_input_upper_bound_v1",
			requestCount: 2,
			inputTokenUpperBound: firstInputUpperBound + secondInputUpperBound,
			outputTokenUpperBound: 30,
			marginBps: 1_000,
		});
	});

	it("uses a UTF-8 input ceiling and applies a ten percent margin", async () => {
		expect(estimateInputQuadTokens({ input: "12345678" })).toBe(2);
		expect(estimateInputTokenUpperBound({ input: "12345678" })).toBe(new TextEncoder().encode(JSON.stringify({ input: "12345678" })).byteLength + 16);
		expect(estimateInputTokenUpperBound({ input: "你好" })).toBe(new TextEncoder().encode(JSON.stringify({ input: "你好" })).byteLength + 16);
		const body = { model: "gpt-4.1-mini", input: "12345678", max_output_tokens: 8 };
		await reserveBatchCredits({
			workspaceId: "ws_1",
			apiKeyId: "key_1",
			requestId: "req_quad",
			providerId: "openai",
			requests: [{ endpoint: "/v1/responses", body }],
		});
		const inputUpperBound = estimateInputTokenUpperBound(body);
		expect(computeBillMock).toHaveBeenCalledWith(expect.objectContaining({ input_tokens: inputUpperBound, output_tokens: 8 }), expect.anything(), expect.anything(), "batch");
		expect(reserveWalletCreditsMock).toHaveBeenCalledWith(expect.objectContaining({
			amountNanos: Math.ceil((8_000 + inputUpperBound) * 1.1),
		}));
	});

	it("loads xAI pricing from the canonical SpaceXAI namespace", async () => {
		loadPriceCardMock.mockImplementation(async (provider: string) =>
			provider === "spacex-ai" ? { provider, model: "spacex-ai/grok-4.3", rules: [] } : null,
		);
		await reserveBatchCredits({
			workspaceId: "ws_1",
			apiKeyId: "key_1",
			requestId: "req_xai",
			providerId: "x-ai",
			requests: [{ endpoint: "/v1/responses", body: { model: "grok-4.3", input: "hello", max_output_tokens: 8 } }],
		});
		expect(loadPriceCardMock).toHaveBeenCalledWith("spacex-ai", "grok-4.3", "text.generate");
	});

	it("rejects endpoints, methods, and paid dimensions that the estimate cannot bound", async () => {
		for (const request of [
			{ endpoint: "/v1/embeddings", body: { model: "gpt-4.1-mini", input: "hello", max_output_tokens: 1 } },
			{ endpoint: "/v1/responses", method: "DELETE", body: { model: "gpt-4.1-mini", input: "hello", max_output_tokens: 1 } },
			{ endpoint: "/v1/responses", body: { model: "gpt-4.1-mini", input: "hello", max_output_tokens: 1, tools: [{ type: "web_search" }] } },
			{ endpoint: "/v1/messages", body: { model: "claude-sonnet-4-6", max_tokens: 1, messages: [{ role: "user", content: [{ type: "text", text: "hello", cache_control: { type: "ephemeral", ttl: "1h" } }] }] } },
		]) {
			await expect(reserveBatchCredits({ workspaceId: "ws_1", apiKeyId: "key_1", requestId: "req_bad", providerId: "openai", requests: [request] })).rejects.toThrow(/batch_(endpoint|method|unbounded_cost_dimension)_not_supported/);
		}
		await expect(reserveBatchCredits({
			workspaceId: "ws_1",
			apiKeyId: "key_1",
			requestId: "req_cache",
			providerId: "anthropic",
			requests: [{
				endpoint: "/v1/messages",
				body: {
					model: "claude-sonnet-4-6",
					max_tokens: 1,
					messages: [{ role: "user", content: [{ type: "text", text: "hello", cache_control: { type: "ephemeral", ttl: "1h" } }] }],
				},
			}],
		})).rejects.toThrow("batch_unbounded_cost_dimension_not_supported");
		expect(reserveWalletCreditsMock).not.toHaveBeenCalled();
	});

	it("rejects unpriced models instead of submitting without a hold", async () => {
		loadPriceCardMock.mockResolvedValue(null);
		await expect(reserveBatchCredits({
			workspaceId: "ws_1",
			apiKeyId: "key_1",
			requestId: "req_1",
			providerId: "openai",
			requests: [{ body: { model: "unknown", max_output_tokens: 1 } }],
		})).rejects.toThrow("batch_reservation_price_card_missing");
		expect(reserveWalletCreditsMock).not.toHaveBeenCalled();
	});
});
