import { describe, expect, it } from "vitest";
import type { ProviderAttemptLog } from "@pipeline/before/types";
import {
	classifyAttemptHealth,
	classifyAttemptLog,
	findServedAttempt,
	isClientCancelledStream,
	markServedAttemptHealth,
	servedAttemptHealthForFailure,
} from "./attempt-health";

const attempt = (overrides: Partial<ProviderAttemptLog>): ProviderAttemptLog => ({
	attempt_number: 1,
	provider: "fixture",
	endpoint: "chat.completions",
	model: "fixture/model",
	outcome: "upstream_non_2xx",
	duration_ms: 10,
	key_source: "gateway",
	...overrides,
});

describe("classifyAttemptHealth", () => {
	it.each([
		// Reachability: we could not get a response at all.
		[{ upstreamStatus: 502 }, "reachability"],
		[{ upstreamStatus: 504 }, "reachability"],
		[{ upstreamStatus: 503 }, "reachability"],
		[{ upstreamStatus: 524 }, "reachability"],
		[{ upstreamStatus: 408 }, "reachability"],
		[{ failureOrigin: "provider" as const, errorCode: "upstream_headers_timeout" }, "reachability"],
		[{ failureOrigin: "provider" as const, errorCode: "ECONNRESET" }, "reachability"],
		// Capacity: the provider turned the call away for load.
		[{ upstreamStatus: 429 }, "capacity"],
		[{ upstreamStatus: 529 }, "capacity"],
		[{ upstreamStatus: 503, errorType: "overloaded_error" }, "capacity"],
		[{ upstreamStatus: 503, errorMessage: "The model is currently overloaded" }, "capacity"],
		[{ upstreamStatus: 500, errorCode: "provider_capacity_exhausted" }, "capacity"],
		[{ failureOrigin: "provider" as const, errorMessage: "Rate limit reached" }, "capacity"],
		// Call errors: the provider accepted the call and then failed it.
		[{ upstreamStatus: 500 }, "call_error"],
		[{ upstreamStatus: 501 }, "call_error"],
		[{ upstreamStatus: 200, midStreamError: true }, "call_error"],
		[{ upstreamStatus: 200, finishReason: "error" }, "call_error"],
		// Customer-caused: excluded.
		[{ upstreamStatus: 400 }, "customer"],
		[{ upstreamStatus: 404 }, "customer"],
		[{ upstreamStatus: 413 }, "customer"],
		[{ upstreamStatus: 422 }, "customer"],
		[{ upstreamStatus: 403, errorCode: "model_region_unavailable" }, "customer"],
		[{ upstreamStatus: 403, errorMessage: "Request blocked by content policy" }, "customer"],
		[{ upstreamStatus: 401, credentialSource: "byok" as const }, "customer"],
		[{ upstreamStatus: 402, credentialSource: "byok" as const }, "customer"],
		[{ upstreamStatus: 403, credentialSource: "byok" as const }, "customer"],
		[{ upstreamStatus: 429, credentialSource: "byok" as const }, "customer"],
		// BYOK credential failures stay the customer's even if the stream also failed.
		[{ upstreamStatus: 429, credentialSource: "byok" as const, midStreamError: true }, "customer"],
		[{ aborted: true, upstreamStatus: 200, midStreamError: true }, "customer"],
		[{ failureOrigin: "client" as const }, "customer"],
		[{ credentialSource: "byok" as const, errorMessage: "too many requests" }, "customer"],
		// Phaseo-caused: excluded.
		[{ upstreamStatus: 401 }, "phaseo"],
		[{ upstreamStatus: 402 }, "phaseo"],
		[{ upstreamStatus: 403 }, "phaseo"],
		[{ outcome: "blocked" as const }, "phaseo"],
		[{ outcome: "no_pricing" as const }, "phaseo"],
		[{ outcome: "unsupported_executor" as const }, "phaseo"],
		[{ failureOrigin: "gateway" as const, upstreamStatus: 500 }, "phaseo"],
		[{ errorMessage: "Cannot read properties of undefined" }, "phaseo"],
		// A socket code without proof it came from the provider fetch is not the provider's.
		[{ errorCode: "ECONNRESET" }, "phaseo"],
		[{ errorMessage: "rate limit" }, "phaseo"],
		// Success.
		[{ upstreamStatus: 200 }, "success"],
		[{ upstreamStatus: 201, finishReason: "stop" }, "success"],
	])("%o -> %s", (input, expected) => {
		expect(classifyAttemptHealth(input)).toBe(expected);
	});
});

describe("classifyAttemptLog", () => {
	it("classifies recorded attempts from their own fields", () => {
		expect(classifyAttemptLog(attempt({ outcome: "success", status: 200 }))).toBe("success");
		expect(classifyAttemptLog(attempt({ status: 503, upstream_error_type: "overloaded_error" }))).toBe("capacity");
		expect(classifyAttemptLog(attempt({ status: 429, key_source: "byok" }))).toBe("customer");
		expect(classifyAttemptLog(attempt({ outcome: "blocked", type: "blocked" }))).toBe("phaseo");
	});
});

describe("served attempt", () => {
	it("marks the last successful attempt, leaving failed attempts alone", () => {
		const attempts = [
			attempt({ attempt_number: 1, status: 502, health_class: "reachability" }),
			attempt({ attempt_number: 2, outcome: "success", status: 200, health_class: "success" }),
		];
		expect(findServedAttempt(attempts)).toBe(attempts[1]);
		markServedAttemptHealth(attempts, "call_error");
		expect(attempts.map((entry) => entry.health_class)).toEqual(["reachability", "call_error"]);
	});

	it("is a no-op without a successful attempt", () => {
		const attempts = [attempt({ status: 500, health_class: "call_error" })];
		markServedAttemptHealth(attempts, "customer");
		expect(attempts[0].health_class).toBe("call_error");
		markServedAttemptHealth(null, "customer");
	});

	it.each([
		["upstream", "upstream_stream_failure", "call_error"],
		["gateway", "google_empty_response", "call_error"],
		["gateway", "normalization_failed", "call_error"],
		["client", "client_closed_request", "customer"],
		// Phaseo's own failure after a good response keeps the provider's success.
		["gateway", "stream_finalization_failed", null],
		["gateway", "speech_usage_missing", null],
	])("%s:%s -> %s", (attribution, code, expected) => {
		expect(servedAttemptHealthForFailure(attribution, code)).toBe(expected);
	});
});

describe("isClientCancelledStream", () => {
	it("needs the client gone first and no provider error", () => {
		expect(isClientCancelledStream({ aborted: true, downstreamDisconnected: true, streamFailed: false })).toBe(true);
		// The provider disconnected mid-stream while the client was still reading.
		expect(isClientCancelledStream({ aborted: true, downstreamDisconnected: false, streamFailed: false })).toBe(false);
		// The provider sent an error event before the client left.
		expect(isClientCancelledStream({ aborted: true, downstreamDisconnected: true, streamFailed: true })).toBe(false);
		expect(isClientCancelledStream({ aborted: false, downstreamDisconnected: true, streamFailed: false })).toBe(false);
	});
});
