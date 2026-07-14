import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPriceCardMock = vi.fn();
const reserveWalletCreditsMock = vi.fn();
const computeBillMock = vi.fn();

vi.mock("@pipeline/pricing/loader", () => ({ loadPriceCard: (...args: any[]) => loadPriceCardMock(...args) }));
vi.mock("@pipeline/pricing/engine", () => ({ computeBill: (...args: any[]) => computeBillMock(...args) }));
vi.mock("@core/wallet-reservations", () => ({ reserveWalletCredits: (...args: any[]) => reserveWalletCreditsMock(...args) }));

import { estimateInputQuadTokens, reserveBatchCredits } from "./batch-reservations";

describe("batch credit reservations", () => {
	beforeEach(() => {
		loadPriceCardMock.mockReset().mockResolvedValue({ provider: "openai", model: "openai/gpt-4.1-mini", rules: [] });
		computeBillMock.mockReset().mockImplementation((usage: any) => ({ pricing: { total_nanos: usage.output_tokens * 1000 + usage.input_tokens } }));
		reserveWalletCreditsMock.mockReset().mockResolvedValue({ status: "held", applied: true, alreadyApplied: false });
	});

	it("reserves the summed conservative quote before submission", async () => {
		const result = await reserveBatchCredits({
			workspaceId: "ws_1",
			requestId: "req_1",
			providerId: "openai",
			requests: [
				{ endpoint: "/v1/responses", body: { model: "gpt-4.1-mini", input: "hello", max_output_tokens: 10 } },
				{ endpoint: "/v1/responses", body: { model: "gpt-4.1-mini", input: "world", max_output_tokens: 20 } },
			],
		});
		expect(result).toMatchObject({ reservationId: "batch_hold:req_1", held: true, status: "held" });
		expect(reserveWalletCreditsMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "ws_1",
			reservationId: "batch_hold:req_1",
			amountNanos: expect.any(Number),
		}));
		expect(result.reservedNanos).toBe(33_006);
	});

	it("uses internal quadtokens for input and applies a ten percent margin", async () => {
		expect(estimateInputQuadTokens({ input: "12345678" })).toBe(2);
		await reserveBatchCredits({
			workspaceId: "ws_1",
			requestId: "req_quad",
			providerId: "openai",
			requests: [{ endpoint: "/v1/responses", body: { model: "gpt-4.1-mini", input: "12345678", max_output_tokens: 8 } }],
		});
		expect(computeBillMock).toHaveBeenCalledWith(expect.objectContaining({ input_tokens: 2, output_tokens: 8 }), expect.anything(), expect.anything(), "batch");
		expect(reserveWalletCreditsMock).toHaveBeenCalledWith(expect.objectContaining({ amountNanos: 8_803 }));
	});

	it("loads xAI pricing from the canonical SpaceXAI namespace", async () => {
		loadPriceCardMock.mockImplementation(async (provider: string) =>
			provider === "spacex-ai" ? { provider, model: "spacex-ai/grok-4.3", rules: [] } : null,
		);
		await reserveBatchCredits({
			workspaceId: "ws_1",
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
		]) {
			await expect(reserveBatchCredits({ workspaceId: "ws_1", requestId: "req_bad", providerId: "openai", requests: [request] })).rejects.toThrow(/batch_(endpoint|method|unbounded_cost_dimension)_not_supported/);
		}
		expect(reserveWalletCreditsMock).not.toHaveBeenCalled();
	});

	it("rejects unpriced models instead of submitting without a hold", async () => {
		loadPriceCardMock.mockResolvedValue(null);
		await expect(reserveBatchCredits({
			workspaceId: "ws_1",
			requestId: "req_1",
			providerId: "openai",
			requests: [{ body: { model: "unknown", max_output_tokens: 1 } }],
		})).rejects.toThrow("batch_reservation_price_card_missing");
		expect(reserveWalletCreditsMock).not.toHaveBeenCalled();
	});
});
