import { describe, expect, it } from "vitest";
import {
	GATEWAY_ERROR_DOCS_URL,
	GATEWAY_ERROR_SUPPORT_URL,
	GATEWAY_KEYS_URL,
	GATEWAY_MODELS_URL,
	normalizeGatewayErrorPayload,
	parseRetryAfterSeconds,
} from "./error-contract";
import { encodeProtocolErrorResponse } from "@protocols/errors";

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
			category: "invalid_request",
			action: expect.stringContaining("Correct the request"),
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
			action: expect.stringContaining("Retry once"),
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

	it("distinguishes missing keys, invalid keys, and unknown model IDs", () => {
		const missingKey = normalizeGatewayErrorPayload({
			error: "unauthorised", status_code: 401, reason: "missing_authorization_header",
		});
		expect(missingKey).toMatchObject({
			category: "authentication",
			message: "This request is missing an API key.",
			help_url: GATEWAY_KEYS_URL,
			action: expect.stringContaining(GATEWAY_KEYS_URL),
			retryable: false,
		});
		const invalidKey = normalizeGatewayErrorPayload({
			error: "unauthorised", status_code: 401, reason: "invalid_secret",
		});
		expect(invalidKey.message).toBe("The API key is invalid, expired, or unavailable.");
		const unknownModel = normalizeGatewayErrorPayload({
			error: "unsupported_model_or_endpoint", status_code: 400,
			reason: "model_not_found_or_inactive", model: "missing/model", error_type: "user",
		});
		expect(unknownModel).toMatchObject({
			category: "model",
			message: "We could not find an active model or alias for the supplied model ID.",
			help_url: GATEWAY_MODELS_URL,
			action: expect.stringContaining(GATEWAY_MODELS_URL),
			retryable: false,
		});
	});

	it("keeps the feature guidance and raw provider error in both protocol envelopes", () => {
		const payload = normalizeGatewayErrorPayload({
			error: "provider_feature_unsupported",
			status_code: 400,
			message: "Structured outputs are not supported by this model.",
			action: "Review supported parameters here: https://phaseo.app/models/inclusionai/ling-3.0-flash-fin",
			help_url: "https://phaseo.app/models/inclusionai/ling-3.0-flash-fin",
			upstream_error: { code: "INVALID_REQUEST_BODY", message: "model features structured outputs not support" },
		});
		for (const protocol of ["openai.responses", "openai.chat.completions", "anthropic.messages"] as const) {
			const encoded = encodeProtocolErrorResponse(protocol, payload);
			expect(encoded).toMatchObject({
				error_code: "provider_feature_unsupported",
			category: "unsupported_feature",
			message: "Structured outputs are not supported by this model.",
			help_url: "https://phaseo.app/models/inclusionai/ling-3.0-flash-fin",
			upstream_error: { code: "INVALID_REQUEST_BODY" },
			});
			expect((encoded.error as { message: string }).message).toBe(payload.message);
		}
	});

	it("names upstream rate limits and unknown gateway failures clearly", () => {
		const limit = normalizeGatewayErrorPayload({
			error: "provider_capacity_exhausted", status_code: 429, failed_statuses: [429],
		});
		expect(limit).toMatchObject({
			category: "rate_limit",
			message: "The upstream provider is rate limiting this request.",
			retryable: true,
		});
		const unexpected = normalizeGatewayErrorPayload({ error: "gateway_error", status_code: 500 });
		expect(unexpected).toMatchObject({
			category: "internal",
			message: "Something went wrong in the gateway. We are investigating.",
			action: expect.stringContaining("contact Phaseo support"),
		});
	});
});
