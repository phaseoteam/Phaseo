import { describe, expect, it } from "vitest";

import { splitGatewayBatchCreatePayload } from "./batches";

describe("splitGatewayBatchCreatePayload", () => {
	it("strips gateway-only webhook config before proxying upstream", () => {
		expect(
			splitGatewayBatchCreatePayload({
				input_file_id: "file_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
				session_id: "session_123",
				webhook: {
					url: "https://example.com/hooks/batch",
					events: ["job.completed"],
				},
			}),
		).toEqual({
			upstreamPayload: {
				input_file_id: "file_123",
				endpoint: "/v1/responses",
				completion_window: "24h",
			},
			webhook: {
				url: "https://example.com/hooks/batch",
				events: ["job.completed"],
			},
		});
	});

	it("returns null webhook when the request does not include one", () => {
		expect(
			splitGatewayBatchCreatePayload({
				input_file_id: "file_123",
				endpoint: "/v1/responses",
				sessionId: "session_456",
			}),
		).toEqual({
			upstreamPayload: {
				input_file_id: "file_123",
				endpoint: "/v1/responses",
			},
			webhook: null,
		});
	});

	it("strips inline requests and preserves webhook endpoint aliases for gateway handling", () => {
		expect(
			splitGatewayBatchCreatePayload({
				requests: [
					{
						custom_id: "row_1",
						body: { model: "gpt-5.4-nano", input: "Hello" },
					},
				],
				endpoint: "/v1/responses",
				webhook_endpoint_id: "we_123",
			}),
		).toEqual({
			upstreamPayload: {
				endpoint: "/v1/responses",
			},
			webhook: {
				endpoint_id: "we_123",
			},
		});
	});
});
