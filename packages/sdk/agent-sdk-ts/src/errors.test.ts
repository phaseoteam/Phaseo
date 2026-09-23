import { describe, expect, it } from "vitest";
import { AgentGatewayError, toAgentGatewayErrorDetails } from "./errors.js";

describe("AgentGatewayError", () => {
	it("preserves the gateway machine code and retry guidance", () => {
		const error = new AgentGatewayError({
			status: 429,
			statusText: "Too Many Requests",
			headers: {
				"x-request-id": "req_123",
				"retry-after": "7"
			},
			body: {
				error: "rate_limit_exceeded",
				message: "Too many requests",
				retryable: true
			}
		});

		expect(error.code).toBe("rate_limit_exceeded");
		expect(error.requestId).toBe("req_123");
		expect(error.retryAfterSeconds).toBe(7);
		expect(toAgentGatewayErrorDetails(error)).toMatchObject({
			status: 429,
			code: "rate_limit_exceeded",
			retryable: true,
			retryAfterSeconds: 7
		});
	});
});
