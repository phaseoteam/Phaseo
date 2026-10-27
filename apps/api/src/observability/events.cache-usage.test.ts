import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearRuntime, configureRuntime } from "@/runtime/env";
import { emitGatewayRequestEvent } from "./events";

const sendAxiomWideEventMock = vi.fn(async (_event: Record<string, unknown>) => {});

vi.mock("./axiom", () => ({
	sendAxiomWideEvent: (...args: unknown[]) => sendAxiomWideEventMock(...args),
}));

describe("Axiom usage summary cache meters", () => {
	beforeEach(() => {
		sendAxiomWideEventMock.mockReset();
		configureRuntime({
			SUPABASE_URL: "https://example.supabase.co",
			SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
			GATEWAY_CACHE: {} as KVNamespace,
			NODE_ENV: "test",
			AXIOM_API_KEY: "axiom_test_key",
			AXIOM_DATASET: "gateway-wide",
			AXIOM_SUCCESS_SAMPLE_RATE: "1",
			AXIOM_DETAIL_SAMPLE_RATE: "1",
			AXIOM_SLOW_REQUEST_MS: "1",
		} as any);
	});

	afterEach(() => {
		clearRuntime();
	});

	it("reports cache reads and writes from the priced meters", async () => {
		await emitGatewayRequestEvent({
			requestId: "req_cache_summary",
			workspaceId: "ws_cache_summary",
			endpoint: "responses",
			model: "anthropic/claude-sonnet-4-6",
			provider: "anthropic",
			statusCode: 200,
			success: true,
			usage: {
				input_tokens: 32_050,
				output_tokens: 400,
				input_tokens_details: { cached_tokens: 30_000, cache_write_tokens: 2_000 },
				pricing: { lines: [
					{ dimension: "input_text_tokens", quantity: 50 },
					{ dimension: "cached_read_text_tokens", quantity: 30_000 },
					{ dimension: "cached_write_text_tokens_5m", quantity: 1_500 },
					{ dimension: "cached_write_text_tokens_1h", quantity: 500 },
				] },
			},
		});
		expect(sendAxiomWideEventMock.mock.calls[0]?.[0]).toMatchObject({
			usage_input_tokens: 32_050,
			usage_cache_read_tokens: 30_000,
			usage_cache_write_tokens: 2_000,
			usage_cache_write_5m_tokens: 1_500,
			usage_cache_write_1h_tokens: 500,
		});
	});

	it("reports OpenAI-style cache writes when usage has no pricing breakdown", async () => {
		await emitGatewayRequestEvent({
			requestId: "req_cache_summary_openai",
			workspaceId: "ws_cache_summary",
			endpoint: "chat.completions",
			model: "openai/gpt-5.6-sol",
			provider: "openai",
			statusCode: 200,
			success: true,
			usage: { prompt_tokens: 10_000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 6_000, cache_write_tokens: 3_000 } },
		});
		expect(sendAxiomWideEventMock.mock.calls[0]?.[0]).toMatchObject({
			usage_cache_read_tokens: 6_000,
			usage_cache_write_tokens: 3_000,
		});
	});
});
