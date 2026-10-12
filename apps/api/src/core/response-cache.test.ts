import {
	applyResponseCacheHeaders,
	buildCachedResponseBody,
	buildCachedResponseRecord,
	buildCachedSseBody,
	buildResponseCacheFingerprint,
	buildResponseCacheFingerprintPayload,
	buildResponseCacheKey,
	clampResponseCacheTtlSeconds,
	isResponseCacheEligible,
	parseResponseCacheFlag,
	parseResponseCacheTtl,
	resolveResponseCachePolicy,
	stableStringify,
} from "./response-cache";
import { describe, expect, it } from "vitest";

describe("response-cache fingerprinting", () => {
	it("produces stable payloads independent of input key order", async () => {
		const first = await buildResponseCacheFingerprint({
			workspaceId: "ws_123",
			apiKeyId: "key_123",
			stream: false,
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			protocol: "responses",
			presetId: "preset_123",
			presetSlug: "fast-agent",
			routingMode: "latency",
			body: {
				input: "hello",
				provider: { only: ["openai"] },
				metadata: { b: 2, a: 1 },
			},
		});
		const second = await buildResponseCacheFingerprint({
			workspaceId: "ws_123",
			apiKeyId: "key_123",
			stream: false,
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			protocol: "responses",
			presetId: "preset_123",
			presetSlug: "fast-agent",
			routingMode: "latency",
			body: {
				metadata: { a: 1, b: 2 },
				provider: { only: ["openai"] },
				input: "hello",
			},
		});

		expect(first.serialized).toBe(second.serialized);
		expect(first.digest).toBe(second.digest);
	});

	it("strips debug fields from the fingerprint payload", () => {
		const payload = buildResponseCacheFingerprintPayload({
			workspaceId: "ws_123",
			apiKeyId: "key_123",
			stream: false,
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			body: {
				input: "hello",
				debug: {
					enabled: true,
					trace: true,
				},
				nested: {
					debug: {
						return_upstream_request: true,
					},
					keep: "value",
				},
			},
		});

		expect(stableStringify(payload)).toContain("\"keep\":\"value\"");
		expect(stableStringify(payload)).not.toContain("\"debug\"");
	});

	it("separates entries by API key and by stream mode", async () => {
		const base = {
			workspaceId: "ws_123",
			apiKeyId: "key_a",
			endpoint: "responses" as const,
			model: "openai/gpt-5.4-nano",
			stream: false,
			body: { input: "hello" },
		};
		const first = await buildResponseCacheFingerprint(base);
		const otherKey = await buildResponseCacheFingerprint({ ...base, apiKeyId: "key_b" });
		const streamed = await buildResponseCacheFingerprint({ ...base, stream: true });

		expect(otherKey.digest).not.toBe(first.digest);
		expect(streamed.digest).not.toBe(first.digest);
	});

	it("builds versioned Redis cache keys scoped to the API key", () => {
		expect(buildResponseCacheKey("key_123", "abc123")).toBe(
			"gateway:response-cache:v2:key_123:abc123",
		);
	});

	it("marks tool-free text requests as eligible, streamed or not", () => {
		const eligible = { endpoint: "responses" as const, stream: false, apiKeyId: "key_123" };
		expect(isResponseCacheEligible(eligible)).toEqual({ eligible: true, reason: "eligible" });
		expect(isResponseCacheEligible({ ...eligible, hasTools: true })).toEqual({
			eligible: false,
			reason: "tools_present",
		});
		expect(isResponseCacheEligible({ ...eligible, stream: true })).toEqual({
			eligible: true,
			reason: "eligible",
		});
	});

	it("skips zero data retention workspaces and requests without an API key", () => {
		expect(
			isResponseCacheEligible({ endpoint: "responses", stream: false, apiKeyId: "key_123", zeroDataRetention: true }),
		).toEqual({ eligible: false, reason: "zero_data_retention" });
		expect(isResponseCacheEligible({ endpoint: "responses", stream: false, apiKeyId: null })).toEqual({
			eligible: false,
			reason: "no_api_key",
		});
	});
});

describe("response-cache policy", () => {
	it("is off unless a request header or the preset turns it on", () => {
		expect(resolveResponseCachePolicy({})).toEqual({
			enabled: false,
			ttlSeconds: null,
			source: "disabled",
			reason: "not_enabled",
		});
		expect(resolveResponseCachePolicy({ presetTtlSeconds: 120 })).toMatchObject({
			enabled: false,
			reason: "not_enabled",
		});
	});

	it("enables from the request header with the default TTL", () => {
		expect(resolveResponseCachePolicy({ requestEnabled: true })).toEqual({
			enabled: true,
			ttlSeconds: 300,
			source: "default",
		});
	});

	it("enables from the preset with the preset TTL", () => {
		expect(resolveResponseCachePolicy({ presetEnabled: true, presetTtlSeconds: 120 })).toEqual({
			enabled: true,
			ttlSeconds: 120,
			source: "preset",
		});
	});

	it("lets the request TTL override the preset TTL", () => {
		expect(
			resolveResponseCachePolicy({ presetEnabled: true, presetTtlSeconds: 120, requestTtlSeconds: 60 }),
		).toMatchObject({ enabled: true, ttlSeconds: 60, source: "request" });
	});

	it("never lets a request override a preset that disables caching", () => {
		expect(resolveResponseCachePolicy({ presetEnabled: false, requestEnabled: true })).toMatchObject({
			enabled: false,
			reason: "preset_disabled",
		});
	});

	it("lets a request disable caching that the preset enables", () => {
		expect(resolveResponseCachePolicy({ presetEnabled: true, requestEnabled: false })).toMatchObject({
			enabled: false,
			reason: "request_disabled",
		});
	});

	it("clamps TTLs into the supported range", () => {
		expect(clampResponseCacheTtlSeconds(0)).toBe(1);
		expect(clampResponseCacheTtlSeconds(90_000)).toBe(86_400);
	});

	it("parses cache headers leniently", () => {
		expect(parseResponseCacheFlag("true")).toBe(true);
		expect(parseResponseCacheFlag(" FALSE ")).toBe(false);
		expect(parseResponseCacheFlag("yes-please")).toBeNull();
		expect(parseResponseCacheFlag(null)).toBeNull();
		expect(parseResponseCacheTtl("60abc")).toBe(60);
		expect(parseResponseCacheTtl("1.5")).toBe(1);
		expect(parseResponseCacheTtl("0")).toBe(1);
		expect(parseResponseCacheTtl("999999")).toBe(86_400);
		expect(parseResponseCacheTtl("abc")).toBeNull();
	});

	it("builds cache records with expiry metadata", () => {
		const record = buildCachedResponseRecord({
			key: "gateway:response-cache:v2:key_123:abc123",
			fingerprint: "abc123",
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			statusCode: 200,
			responseBody: { id: "resp_123" },
			providerId: "openai",
			sourceRequestId: "req_source",
			ttlSeconds: 120,
			now: new Date("2026-05-09T12:00:00.000Z"),
		});

		expect(record.createdAt).toBe("2026-05-09T12:00:00.000Z");
		expect(record.expiresAt).toBe("2026-05-09T12:02:00.000Z");
		expect(record.providerId).toBe("openai");
		expect(record.sourceRequestId).toBe("req_source");
	});
});

describe("response-cache replay", () => {
	it("gives a hit its own ID and creation time and zeroes its usage", () => {
		const stored = {
			id: "req_source",
			object: "chat.completion",
			created: 1_700_000_000,
			usage: {
				prompt_tokens: 10,
				completion_tokens: 4,
				total_tokens: 14,
				prompt_tokens_details: { cached_tokens: 2 },
			},
		};
		const body = buildCachedResponseBody({
			responseBody: stored,
			sourceRequestId: "req_source",
			requestId: "req_hit",
			now: new Date("2026-10-12T00:00:00.000Z"),
		});

		expect(body).toEqual({
			id: "req_hit",
			object: "chat.completion",
			created: 1_791_763_200,
			usage: {
				prompt_tokens: 0,
				completion_tokens: 0,
				total_tokens: 0,
				prompt_tokens_details: { cached_tokens: 0 },
			},
		});
		expect(stored.usage.total_tokens).toBe(14);
	});

	it("rewrites derived IDs and nested usage in a buffered body", () => {
		const body = buildCachedResponseBody({
			responseBody: {
				id: "req_source",
				output: [{ id: "req_source-reasoning-0-1", type: "reasoning" }],
				response: { usage: { input_tokens: 5 } },
				nativeResponseId: "resp_native",
			},
			sourceRequestId: "req_source",
			requestId: "req_hit",
		});
		expect(body).toEqual({
			id: "req_hit",
			output: [{ id: "req_hit-reasoning-0-1", type: "reasoning" }],
			response: { usage: { input_tokens: 0 } },
			nativeResponseId: "resp_native",
		});
	});

	it("replays a stored stream as SSE with a new ID and zero usage", () => {
		const sse = buildCachedSseBody({
			frames: [
				{ eventName: null, data: { id: "req_source", created: 1, choices: [{ delta: { content: "hi" } }] } },
				{ eventName: null, data: { id: "req_source", choices: [], usage: { prompt_tokens: 3, completion_tokens: 1 } } },
				{ raw: "data: [DONE]" },
			],
			sourceRequestId: "req_source",
			requestId: "req_hit",
			now: new Date("2026-10-12T00:00:00.000Z"),
		});
		expect(sse).toBe(
			`data: {"id":"req_hit","created":1791763200,"choices":[{"delta":{"content":"hi"}}]}\n\n` +
			`data: {"id":"req_hit","choices":[],"usage":{"prompt_tokens":0,"completion_tokens":0}}\n\n` +
			"data: [DONE]\n\n",
		);
	});

	it("keeps event names when replaying Messages and Responses streams", () => {
		const sse = buildCachedSseBody({
			frames: [{ eventName: "message_start", data: { type: "message_start", message: { id: "req_source", usage: { input_tokens: 9 } } } }],
			sourceRequestId: "req_source",
			requestId: "req_hit",
		});
		expect(sse).toBe(
			`event: message_start\ndata: {"type":"message_start","message":{"id":"req_hit","usage":{"input_tokens":0}}}\n\n`,
		);
	});

	it("sets status, age, remaining TTL and source headers on a hit", () => {
		const headers = new Headers();
		applyResponseCacheHeaders(headers, {
			status: "hit",
			ttlSeconds: 300,
			ageMs: 61_500,
			sourceRequestId: "req_source",
		});
		expect(Object.fromEntries(headers)).toEqual({
			"x-phaseo-cache-status": "HIT",
			"x-phaseo-cache-age": "61",
			"x-phaseo-cache-ttl": "239",
			"x-phaseo-cache-source-id": "req_source",
		});
	});

	it("sets status and the full TTL on a miss", () => {
		const headers = new Headers();
		applyResponseCacheHeaders(headers, { status: "miss", ttlSeconds: 300 });
		expect(Object.fromEntries(headers)).toEqual({
			"x-phaseo-cache-status": "MISS",
			"x-phaseo-cache-ttl": "300",
		});
	});
});
