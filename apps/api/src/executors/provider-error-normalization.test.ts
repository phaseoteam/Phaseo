import { describe, expect, it } from "vitest";
import { normalizeProviderErrorCode } from "./provider-error-normalization";

describe("provider error fallback", () => {
	it.each([
		[{ status: 403, code: "NOT_ENOUGH_BALANCE" }, "provider_payment_required"],
		[{ status: 400, code: "INVALID_REQUEST_BODY" }, "provider_request_rejected"],
		[{ status: 429, code: "RATE_LIMIT_EXCEEDED" }, "provider_capacity_exhausted"],
		[{ status: 429, code: "TOKEN_LIMIT_EXCEEDED" }, "provider_capacity_exhausted"],
		[{ status: 503, code: "SERVICE_NOT_AVAILABLE" }, "provider_service_unavailable"],
		[{ status: 429, type: "resource_exhausted" }, "provider_capacity_exhausted"],
		[{ status: 429, code: "ThrottlingException" }, "provider_capacity_exhausted"],
		[{ status: 503, type: "overloaded_error" }, "provider_service_unavailable"],
		[{ status: 402, code: null }, "provider_payment_required"],
		[{ status: 500, code: "internal_error" }, null],
	] as const)("maps %j to %s", (signals, expected) => {
		expect(normalizeProviderErrorCode(signals)).toBe(expected);
	});
});
