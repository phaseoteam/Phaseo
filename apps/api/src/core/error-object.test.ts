import { describe, expect, it } from "vitest";
import {
	chatStreamErrorFrame,
	errorCodeOf,
	errorTypeFor,
	withErrorObject,
	withErrorObjectResponse,
	withGatewayErrorObject,
} from "./error-object";
import { err } from "@pipeline/before/http";
import { encodeStreamInterruption } from "@pipeline/after/stream-reencode";
import { encodeUnifiedStreamEvent } from "@protocols/stream/encode";
import { settleMixedRateLimitAcrossModels } from "@pipeline/index";

describe("errorTypeFor", () => {
	it.each([
		[400, "validation_error", "invalid_request_error"],
		[401, "unauthorised", "authentication_error"],
		[402, "insufficient_funds", "insufficient_quota"],
		[403, "guardrail_blocked", "permission_error"],
		[404, "not_found", "not_found_error"],
		[409, "not_ready", "invalid_request_error"],
		[410, "model_retired", "invalid_request_error"],
		[413, "payload_too_large", "invalid_request_error"],
		[429, "rate_limit_exceeded", "rate_limit_error"],
		[429, "upstream_error", "rate_limit_error"],
		[500, "gateway_error", "server_error"],
		[502, "upstream_error", "server_error"],
		[503, "upstream_error", "service_unavailable"],
		[529, "upstream_error", "overloaded"],
	])("maps status %i (%s) to %s", (status, code, type) => {
		expect(errorTypeFor(status, code)).toBe(type);
	});

	it("uses the code when there is no status, as inside a stream", () => {
		expect(errorTypeFor(null, "rate_limit_exceeded")).toBe("rate_limit_error");
		expect(errorTypeFor(null, "overloaded_error")).toBe("overloaded");
		expect(errorTypeFor(null, "context_length_exceeded")).toBe("invalid_request_error");
		expect(errorTypeFor(null, "insufficient_quota")).toBe("insufficient_quota");
		expect(errorTypeFor(null, "upstream_stream_failure")).toBe("server_error");
		expect(errorTypeFor(undefined, null)).toBe("server_error");
	});
});

describe("withErrorObject", () => {
	it("moves the code string into an error object and keeps the top-level fields", () => {
		const shaped = withErrorObject({
			error: "upstream_error",
			description: "All providers failed.",
			status_code: 502,
			error_type: "system",
			error_origin: "upstream",
			reason: "all_candidates_failed",
			failed_providers: ["openai"],
			upstream_error: { code: "server_error", message: "boom", param: "temperature" },
		}, 502, { retryAfter: "7" });
		expect(shaped).toEqual({
			error: {
				code: "upstream_error",
				message: "All providers failed.",
				type: "server_error",
				param: "temperature",
				metadata: {
					reason: "all_candidates_failed",
					failed_providers: ["openai"],
					upstream_error: { code: "server_error", message: "boom", param: "temperature" },
					retry_after_seconds: 7,
				},
			},
			code: "upstream_error",
			description: "All providers failed.",
			status_code: 502,
			error_type: "system",
			error_origin: "upstream",
			reason: "all_candidates_failed",
			failed_providers: ["openai"],
			upstream_error: { code: "server_error", message: "boom", param: "temperature" },
		});
	});

	it("refreshes the type of a body already in this shape when the status changes", () => {
		const first = withErrorObject({ error: "upstream_error", message: "limited" }, 429);
		expect((first.error as any).type).toBe("rate_limit_error");
		const second = withErrorObject({ ...first, status_code: 502 }, 502);
		expect(second.error).toEqual({ ...(first.error as object), type: "server_error" });
		expect(second.code).toBe("upstream_error");
	});

	it("keeps top-level code equal to error.code when the body carries a different code", () => {
		const body = withErrorObject({ error: "upstream_error", code: "rate_limit_exceeded", message: "failed" }, 429);
		expect(body.code).toBe("upstream_error");
		expect((body.error as any).code).toBe("upstream_error");
		expect(errorCodeOf(body)).toBe("upstream_error");
		const refreshed = withErrorObject({ ...body, status_code: 502 }, 502);
		expect((refreshed.error as any).type).toBe("server_error");
	});

	it("leaves an upstream's own error object alone", () => {
		const upstream = { error: { message: "bad", type: "invalid_request_error", code: null } };
		expect(withErrorObject(upstream, 400)).toBe(upstream);
	});

	it("reads the code from either shape", () => {
		expect(errorCodeOf({ error: "validation_error" })).toBe("validation_error");
		expect(errorCodeOf(withErrorObject({ error: "validation_error" }, 400))).toBe("validation_error");
		expect(errorCodeOf({ error: { code: "x" } })).toBe("x");
		expect(errorCodeOf(null)).toBeNull();
	});
});

describe("withGatewayErrorObject", () => {
	it("turns a batch-route error object keyed by type into the full error object", () => {
		const body = withGatewayErrorObject(
			{ error: { type: "validation_error", reason: "batch_file_too_large", message: "Too large." }, request_id: "req_1" },
			413,
		);
		expect(body).toEqual({
			error: {
				code: "validation_error",
				message: "Too large.",
				type: "invalid_request_error",
				param: null,
				reason: "batch_file_too_large",
				metadata: { reason: "batch_file_too_large" },
			},
			code: "validation_error",
			request_id: "req_1",
		});
	});

	it("falls back to the reason for the message and keeps the object's other fields", () => {
		const body = withGatewayErrorObject(
			{ error: { type: "upstream_outcome_unknown", reason: "provider_timeout", batch_id: "batch_1", provider: "openai" } },
			502,
		);
		expect(body.code).toBe("upstream_outcome_unknown");
		expect(body.error).toMatchObject({
			code: "upstream_outcome_unknown",
			message: "provider_timeout",
			type: "server_error",
			batch_id: "batch_1",
			metadata: { reason: "provider_timeout", provider: "openai" },
		});
	});

	it("fills in the type and top-level code for an object that has only code and message", () => {
		const body = withGatewayErrorObject({ error: { code: "websocket_upgrade_required", message: "Use WebSocket." } }, 426);
		expect(body).toEqual({
			error: { code: "websocket_upgrade_required", message: "Use WebSocket.", type: "invalid_request_error", param: null },
			code: "websocket_upgrade_required",
		});
	});

	it("shapes a code-string body exactly as withErrorObject does", () => {
		const legacy = { error: "forbidden", reason: "batch_api_feature_flag_disabled", message: "Off." };
		expect(withGatewayErrorObject(legacy, 403)).toEqual(withErrorObject(legacy, 403));
	});
});

describe("representative error responses", () => {
	it("validation 400: names the param and keeps message and status_code", async () => {
		const response = err("validation_error", {
			message: "Unknown parameter: foo",
			details: [{ message: "Unknown parameter", path: ["foo"] }],
		});
		expect(response.status).toBe(400);
		const body = await response.json();
		expect(body.error).toEqual({
			code: "validation_error",
			message: "Unknown parameter: foo",
			type: "invalid_request_error",
			param: "foo",
		});
		expect(body).toMatchObject({ code: "validation_error", message: "Unknown parameter: foo", status_code: 400, error_type: "user" });
	});

	it("auth 401: authentication_error", async () => {
		const body = await err("unauthorised", { message: "Invalid API key." }).json();
		expect(body.error).toMatchObject({ code: "unauthorised", message: "Invalid API key.", type: "authentication_error", param: null });
		expect(body).toMatchObject({ code: "unauthorised", message: "Invalid API key.", status_code: 401 });
	});

	it("rate limit 429: rate_limit_error with the limit detail in metadata", async () => {
		const body = await err("rate_limit_exceeded", {
			reason: "policy_requests_per_minute",
			policy_id: "policy-1",
			limit_scope: "key",
			description: "Retry after 9 seconds.",
		}).json();
		expect(body.error).toEqual({
			code: "rate_limit_exceeded",
			message: "Retry after 9 seconds.",
			type: "rate_limit_error",
			param: null,
			metadata: { reason: "policy_requests_per_minute", policy_id: "policy-1", limit_scope: "key" },
		});
		expect(body).toMatchObject({ code: "rate_limit_exceeded", status_code: 429, policy_id: "policy-1" });
	});

	it("upstream 5xx: server_error with the provider detail in metadata", async () => {
		const body = await err("upstream_error", { reason: "openai_timeout", provider: "openai", message: "Provider timed out." }).json();
		expect(body.error).toMatchObject({
			code: "upstream_error",
			message: "Provider timed out.",
			type: "server_error",
			metadata: { provider: "openai", reason: "openai_timeout" },
		});
		expect(body).toMatchObject({ code: "upstream_error", status_code: 502, provider: "openai" });
	});

	it("reshapes JSON error responses that still carry a code string", async () => {
		const response = await withErrorObjectResponse(new Response(
			JSON.stringify({ error: "not_implemented", description: "Endpoint x is not implemented yet.", status_code: 501 }),
			{ status: 501, headers: { "Content-Type": "application/json", "X-Test": "1" } },
		));
		expect(response.status).toBe(501);
		expect(response.headers.get("X-Test")).toBe("1");
		expect(await response.json()).toMatchObject({
			error: { code: "not_implemented", message: "Endpoint x is not implemented yet.", type: "server_error" },
			code: "not_implemented",
			description: "Endpoint x is not implemented yet.",
			status_code: 501,
		});
	});

	it("passes through successes, streams and upstream error objects", async () => {
		const ok = new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } });
		expect(await withErrorObjectResponse(ok)).toBe(ok);
		const stream = new Response("data: {}\n\n", { status: 500, headers: { "Content-Type": "text/event-stream" } });
		expect(await withErrorObjectResponse(stream)).toBe(stream);
		const upstream = new Response(JSON.stringify({ error: { message: "bad" } }), { status: 400, headers: { "Content-Type": "application/json" } });
		expect(await withErrorObjectResponse(upstream)).toBe(upstream);
	});

	it("keeps the object when mixed failures turn a 429 into a 502", async () => {
		const limited = await err("upstream_error", { message: "limited" }).json();
		const response = await settleMixedRateLimitAcrossModels(
			new Response(JSON.stringify(withErrorObject({ ...limited, status_code: 429 }, 429)), { status: 429 }),
			[{ model: "a", status: 503, stage: "execute" }, { model: "b", status: 429, stage: "execute" }],
		);
		expect(response.status).toBe(502);
		const body = await response.json();
		expect(body).toMatchObject({ code: "upstream_error", status_code: 502 });
		expect(body.error).toMatchObject({ code: "upstream_error", type: "server_error" });
	});
});

describe("Chat stream error frames", () => {
	it("builds the frame with the error object and the top-level fields", () => {
		expect(chatStreamErrorFrame({ message: "Rate limited", code: "rate_limit_exceeded" })).toEqual({
			object: "error",
			message: "Rate limited",
			code: "rate_limit_exceeded",
			error: { code: "rate_limit_exceeded", message: "Rate limited", type: "rate_limit_error", param: null },
		});
		expect(chatStreamErrorFrame({ message: "boom" })).toEqual({
			object: "error",
			message: "boom",
			error: { code: null, message: "boom", type: "server_error", param: null },
		});
	});

	it("carries the object on a mid-stream upstream error re-encoded for Chat", () => {
		const encoded = encodeUnifiedStreamEvent("openai.chat.completions", {
			type: "error",
			message: "Overloaded",
			payload: { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
		}, {});
		expect(encoded?.frame).toMatchObject({
			object: "error",
			message: "Overloaded",
			error: { code: "overloaded_error", message: "Overloaded", type: "overloaded", param: null },
		});
	});

	it("carries the object on the interruption frame", () => {
		expect(encodeStreamInterruption("openai.chat.completions", {}).frame).toMatchObject({
			object: "error",
			code: "upstream_stream_failure",
			error: { code: "upstream_stream_failure", type: "server_error" },
		});
	});
});
