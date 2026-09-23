import { describe, expect, it } from "vitest";
import {
	GATEWAY_ERROR_DOCS_URL,
	GATEWAY_ERROR_SUPPORT_URL,
	normalizeGatewayErrorPayload,
	parseRetryAfterSeconds,
} from "./error-contract";

describe("gateway error contract", () => {
	it("adds correlation, recovery, and support fields without removing diagnostics", () => {
		const payload = normalizeGatewayErrorPayload(
			{
				error: "validation_error",
				status_code: 400,
				description: "Temperature must be below 1.",
				details: [{ message: "temperature is too high", path: ["temperature"] }],
			},
			{ requestId: "G-VALIDATION-1", errorType: "user", errorOrigin: "user" },
		);

		expect(payload).toMatchObject({
			request_id: "G-VALIDATION-1",
			generation_id: "G-VALIDATION-1",
			status_code: 400,
			error: "validation_error",
			error_type: "user",
			error_origin: "user",
			message: "The request contains invalid parameters.",
			retryable: false,
			action: expect.stringContaining("Check the fields"),
			docs_url: GATEWAY_ERROR_DOCS_URL,
			support_url: GATEWAY_ERROR_SUPPORT_URL,
			details: [{ message: "temperature is too high" }],
		});
	});

	it("uses Retry-After and upstream status to describe a retryable failure", () => {
		const payload = normalizeGatewayErrorPayload(
			{
				error: "upstream_error",
				status_code: 502,
				failed_statuses: [503],
			},
			{ requestId: "G-UPSTREAM-1", retryAfterSeconds: 15 },
		);

		expect(payload).toMatchObject({
			retryable: true,
			retry_after_seconds: 15,
			action: expect.stringContaining("backoff"),
		});
	});

	it("does not tell callers to retry provider credential failures", () => {
		const payload = normalizeGatewayErrorPayload({
			error: "upstream_error",
			status_code: 502,
			failed_statuses: [401, 403],
		});

		expect(payload.retryable).toBe(false);
	});

	it("parses both seconds and HTTP-date Retry-After values", () => {
		expect(parseRetryAfterSeconds("30", 0)).toBe(30);
		expect(parseRetryAfterSeconds("Thu, 01 Jan 1970 00:00:30 GMT", 0)).toBe(30);
		expect(parseRetryAfterSeconds("not-a-delay", 0)).toBeNull();
	});
});
