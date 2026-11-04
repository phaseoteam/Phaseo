import { describe, expect, it } from "vitest";
import type { ProviderAttemptLog } from "@pipeline/before/types";
import {
	ATTEMPT_HEALTH_REASONS,
	applyAttemptHealth,
	classifyAttemptHealth,
	classifyAttemptHealthDetail,
	classifyAttemptLog,
	classifyAttemptLogDetail,
	findServedAttempt,
	isClientCancelledStream,
	markServedAttemptHealth,
	reclassifyAttemptsAcceptedElsewhere,
	servedAttemptHealthForFailure,
	streamHealthSignals,
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
		// A 404 with no error body on Phaseo's managed key is a route whose model the provider does not know.
		[{ upstreamStatus: 404 }, "phaseo"],
		[{ upstreamStatus: 404, errorMessage: "No such file: file-abc" }, "customer"],
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
		markServedAttemptHealth(attempts, { healthClass: "call_error", reason: "stream_break" });
		expect(attempts.map((entry) => entry.health_class)).toEqual(["reachability", "call_error"]);
		expect(attempts[1].health_reason).toBe("stream_break");
	});

	it("is a no-op without a successful attempt", () => {
		const attempts = [attempt({ status: 500, health_class: "call_error" })];
		markServedAttemptHealth(attempts, { healthClass: "customer", reason: "client_cancelled" });
		expect(attempts[0].health_class).toBe("call_error");
		markServedAttemptHealth(null, { healthClass: "customer", reason: "client_cancelled" });
	});

	it.each([
		["upstream", "upstream_stream_failure", { healthClass: "call_error", reason: "stream_break" }],
		["gateway", "google_empty_response", { healthClass: "call_error", reason: "empty_output" }],
		["gateway", "normalization_failed", { healthClass: "call_error", reason: "invalid_output" }],
		["client", "client_closed_request", { healthClass: "customer", reason: "client_cancelled" }],
		// Phaseo's own failure after a good response keeps the provider's success.
		["gateway", "stream_finalization_failed", null],
		["gateway", "speech_usage_missing", null],
	])("%s:%s -> %o", (attribution, code, expected) => {
		expect(servedAttemptHealthForFailure(attribution, code)).toEqual(expected);
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

describe("classifyAttemptHealthDetail reasons", () => {
	it.each([
		// Reachability
		[{ failureOrigin: "provider" as const, errorCode: "ECONNRESET" }, "reachability", "transport"],
		[{ failureOrigin: "provider" as const, errorCode: "upstream_headers_timeout" }, "reachability", "headers_timeout"],
		[{ upstreamStatus: 408 }, "reachability", "headers_timeout"],
		[{ upstreamStatus: 503 }, "reachability", "upstream_unavailable"],
		[{ upstreamStatus: 524 }, "reachability", "upstream_unavailable"],
		// Capacity
		[{ upstreamStatus: 429 }, "capacity", "rate_limited"],
		[{ upstreamStatus: 529 }, "capacity", "overloaded"],
		[{ upstreamStatus: 503, errorType: "overloaded_error" }, "capacity", "overloaded"],
		// Call errors
		[{ upstreamStatus: 500 }, "call_error", "server_error"],
		[{ upstreamStatus: 200, midStreamError: true }, "call_error", "stream_break"],
		[{ upstreamStatus: 200, finishReason: "error" }, "call_error", "error_finish"],
		// Customer
		[{ aborted: true, upstreamStatus: 200 }, "customer", "client_cancelled"],
		[{ upstreamStatus: 401, credentialSource: "byok" as const }, "customer", "byok_error"],
		[{ upstreamStatus: 429, credentialSource: "byok" as const }, "customer", "customer_key_limit"],
		[{ credentialSource: "byok" as const, errorMessage: "too many requests" }, "customer", "customer_key_limit"],
		[{ upstreamStatus: 400, errorMessage: "messages: field required" }, "customer", "invalid_request"],
		[{ upstreamStatus: 413 }, "customer", "invalid_request"],
		[{ upstreamStatus: 400, errorCode: "prohibited_content" }, "customer", "content_policy"],
		[{ upstreamStatus: 403, errorMessage: "Request blocked by content policy" }, "customer", "content_policy"],
		[{ upstreamStatus: 403, errorCode: "model_region_unavailable" }, "customer", "region_unavailable"],
		// A wrong model id on the customer's own key is not evidence about our route.
		[{ upstreamStatus: 404, credentialSource: "byok" as const }, "customer", "invalid_request"],
		// Phaseo
		[{ upstreamStatus: 401 }, "phaseo", "phaseo_key_auth"],
		[{ upstreamStatus: 402 }, "phaseo", "phaseo_key_auth"],
		[{ upstreamStatus: 403 }, "phaseo", "phaseo_key_auth"],
		// 401/402 stay key problems even if the body mentions a region.
		[{ upstreamStatus: 401, errorMessage: "invalid key for region" }, "phaseo", "phaseo_key_auth"],
		// Provider 404s for the model on Phaseo's managed route (gmicloud returned an empty body).
		[{ upstreamStatus: 404 }, "phaseo", "route_model_not_found"],
		[{ upstreamStatus: 404, errorCode: "NOT_FOUND", errorMessage: "Publisher model `gemini-x` was not found or your project does not have access to it." }, "phaseo", "route_model_not_found"],
		[{ upstreamStatus: 404, errorCode: "ModelNotOpen", errorMessage: "Your account has not activated the model deepseek-v4." }, "phaseo", "route_model_not_found"],
		[{ upstreamStatus: 400, errorMessage: "Model does not exist. Please check it carefully." }, "phaseo", "route_model_not_found"],
		[{ upstreamStatus: 404, errorCode: "model_not_found" }, "phaseo", "route_model_not_found"],
		// A 404 for another resource is the request's.
		[{ upstreamStatus: 404, errorMessage: "Previous response with id 'resp_1' not found." }, "customer", "invalid_request"],
		// A model that does not support a feature is not a missing model.
		[{ upstreamStatus: 400, errorMessage: "model: inclusionai/ling-3.1-flash does not support feature: structured-outputs" }, "customer", "invalid_request"],
		// Providers see Phaseo's egress location, whatever key is used.
		[{ upstreamStatus: 400, errorCode: "invalid_request", errorMessage: "User location is not supported for the API use." }, "phaseo", "egress_location_unsupported"],
		[{ upstreamStatus: 403, errorCode: "unsupported_country_region_territory" }, "phaseo", "egress_location_unsupported"],
		[{ upstreamStatus: 400, credentialSource: "byok" as const, errorMessage: "User location is not supported for the API use." }, "phaseo", "egress_location_unsupported"],
		[{ outcome: "blocked" as const }, "phaseo", "breaker_blocked"],
		[{ outcome: "no_pricing" as const }, "phaseo", "gateway_fault"],
		[{ outcome: "unsupported_executor" as const }, "phaseo", "gateway_fault"],
		[{ failureOrigin: "gateway" as const }, "phaseo", "gateway_fault"],
		[{ errorMessage: "Cannot read properties of undefined" }, "phaseo", "gateway_fault"],
	])("%o -> %s / %s", (input, healthClass, reason) => {
		expect(classifyAttemptHealthDetail(input)).toEqual({ healthClass, reason });
	});

	it("gives a plain success no reason", () => {
		expect(classifyAttemptHealthDetail({ upstreamStatus: 200 })).toEqual({ healthClass: "success", reason: null });
		expect(classifyAttemptLogDetail(attempt({ outcome: "success", status: 200 }))).toEqual({ healthClass: "success", reason: null });
	});

	it("maps every reason onto one failure or excluded class", () => {
		for (const healthClass of Object.values(ATTEMPT_HEALTH_REASONS)) {
			expect(["reachability", "capacity", "call_error", "customer", "phaseo"]).toContain(healthClass);
		}
	});

	it("classifies a log once, keeping a class set by the executor", () => {
		const unclassified = attempt({ status: 404 });
		applyAttemptHealth(unclassified);
		expect([unclassified.health_class, unclassified.health_reason]).toEqual(["phaseo", "route_model_not_found"]);
		const thrown = attempt({ outcome: "error", health_class: "reachability", health_reason: "transport" });
		applyAttemptHealth(thrown);
		expect([thrown.health_class, thrown.health_reason]).toEqual(["reachability", "transport"]);
	});
});

describe("reclassifyAttemptsAcceptedElsewhere", () => {
	const classified = (overrides: Partial<ProviderAttemptLog>) => {
		const entry = attempt(overrides);
		applyAttemptHealth(entry);
		return entry;
	};

	it("makes a 4xx that another provider then accepted Phaseo's", () => {
		const attempts = [
			classified({ attempt_number: 1, provider: "siliconflow", provider_model_slug: "tencent/Hy3", status: 400, upstream_error_message: "Json mode is not supported for this model." }),
			classified({ attempt_number: 2, provider: "google-ai-studio", provider_model_slug: "gemma-4-31b-it", outcome: "success", status: 200 }),
		];
		expect(attempts[0].health_class).toBe("customer");
		reclassifyAttemptsAcceptedElsewhere(attempts);
		expect([attempts[0].health_class, attempts[0].health_reason]).toEqual(["phaseo", "provider_rejected_request_accepted_elsewhere"]);
		expect([attempts[1].health_class, attempts[1].health_reason]).toEqual(["success", null]);
	});

	it("covers a fallback to another model on the same provider", () => {
		const attempts = [
			classified({ attempt_number: 1, provider: "novita", provider_model_slug: "inclusionai/ling-3.1-flash", status: 400, upstream_error_message: "does not support feature: structured-outputs" }),
			classified({ attempt_number: 2, provider: "novita", provider_model_slug: "apodex/apodex-1.1-mini", outcome: "success", status: 200 }),
		];
		reclassifyAttemptsAcceptedElsewhere(attempts);
		expect(attempts[0].health_reason).toBe("provider_rejected_request_accepted_elsewhere");
	});

	it("also applies when the served stream later broke", () => {
		const attempts = [
			classified({ attempt_number: 1, provider: "a", status: 422 }),
			classified({ attempt_number: 2, provider: "b", outcome: "success", status: 200 }),
		];
		markServedAttemptHealth(attempts, { healthClass: "call_error", reason: "stream_break" });
		reclassifyAttemptsAcceptedElsewhere(attempts);
		expect(attempts.map((entry) => entry.health_reason)).toEqual(["provider_rejected_request_accepted_elsewhere", "stream_break"]);
	});

	it.each([
		["the customer's own key", { status: 401, key_source: "byok" as const }, "customer", "byok_error"],
		["the customer's key limit", { status: 429, key_source: "byok" as const }, "customer", "customer_key_limit"],
		["a provider failure", { status: 503 }, "reachability", "upstream_unavailable"],
		["Phaseo's key", { status: 401 }, "phaseo", "phaseo_key_auth"],
	])("leaves %s alone", (_label, overrides, healthClass, reason) => {
		const attempts = [
			classified({ attempt_number: 1, provider: "a", ...overrides }),
			classified({ attempt_number: 2, provider: "b", outcome: "success", status: 200 }),
		];
		reclassifyAttemptsAcceptedElsewhere(attempts);
		expect([attempts[0].health_class, attempts[0].health_reason]).toEqual([healthClass, reason]);
	});

	it("needs a success on a different route, after the rejection", () => {
		// The same route accepted it on retry: not evidence against the route.
		const sameRoute = [
			classified({ attempt_number: 1, provider: "a", provider_model_slug: "m", status: 400 }),
			classified({ attempt_number: 2, provider: "a", provider_model_slug: "m", outcome: "success", status: 200 }),
		];
		reclassifyAttemptsAcceptedElsewhere(sameRoute);
		expect(sameRoute[0].health_reason).toBe("invalid_request");
		// Nobody accepted it: the request really was the problem.
		const noSuccess = [
			classified({ attempt_number: 1, provider: "a", status: 400 }),
			classified({ attempt_number: 2, provider: "b", status: 400 }),
		];
		reclassifyAttemptsAcceptedElsewhere(noSuccess);
		expect(noSuccess.map((entry) => entry.health_reason)).toEqual(["invalid_request", "invalid_request"]);
		// A rejection after the served attempt is left alone.
		const after = [
			classified({ attempt_number: 1, provider: "b", outcome: "success", status: 200 }),
			classified({ attempt_number: 2, provider: "a", status: 400 }),
		];
		reclassifyAttemptsAcceptedElsewhere(after);
		expect(after[1].health_reason).toBe("invalid_request");
		reclassifyAttemptsAcceptedElsewhere(null);
	});
});

describe("streamHealthSignals", () => {
	it("treats a provider that dropped the stream as a mid-stream failure", () => {
		expect(streamHealthSignals({ aborted: true, downstreamDisconnected: false, streamFailed: false })).toEqual({ clientCancelled: false, midStreamError: true });
	});

	it("keeps a client cancellation neutral", () => {
		const signals = streamHealthSignals({ aborted: true, downstreamDisconnected: true, streamFailed: false });
		expect(signals).toEqual({ clientCancelled: true, midStreamError: false });
		expect(classifyAttemptHealth({ upstreamStatus: 200, aborted: signals.clientCancelled, midStreamError: signals.midStreamError })).toBe("customer");
	});

	it("keeps a provider error event a failure even after the client left", () => {
		expect(streamHealthSignals({ aborted: true, downstreamDisconnected: true, streamFailed: true })).toEqual({ clientCancelled: false, midStreamError: true });
		expect(streamHealthSignals({ aborted: false, downstreamDisconnected: false, streamFailed: false })).toEqual({ clientCancelled: false, midStreamError: false });
	});
});
