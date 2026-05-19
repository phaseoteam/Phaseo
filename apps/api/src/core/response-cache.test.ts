import {
	buildCachedResponseRecord,
	buildResponseCacheFingerprint,
	buildResponseCacheFingerprintPayload,
	buildResponseCacheKey,
	clampResponseCacheTtlSeconds,
	isResponseCacheEligible,
	resolveResponseCachePolicy,
	stableStringify,
} from "./response-cache";
import { describe, expect, it } from "vitest";

describe("response-cache fingerprinting", () => {
	it("produces stable payloads independent of input key order", async () => {
		const first = await buildResponseCacheFingerprint({
			workspaceId: "ws_123",
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

	it("builds versioned Redis cache keys", () => {
		expect(buildResponseCacheKey("ws_123", "abc123")).toBe(
			"gateway:response-cache:v1:ws_123:abc123",
		);
	});

	it("marks only non-stream tool-free text requests as eligible", () => {
		expect(
			isResponseCacheEligible({
				endpoint: "responses",
				stream: false,
				hasTools: false,
				serverToolsEnabled: false,
			}),
		).toEqual({
			eligible: true,
			reason: "eligible",
		});
		expect(
			isResponseCacheEligible({
				endpoint: "responses",
				stream: false,
				hasTools: true,
				serverToolsEnabled: false,
			}),
		).toEqual({
			eligible: false,
			reason: "tools_present",
		});
	});
});

describe("response-cache policy", () => {
	it("prefers explicit request TTL over all other sources", () => {
		expect(
			resolveResponseCachePolicy({
				requestTtlSeconds: 60,
				presetTtlSeconds: 300,
				workspaceDefaultTtlSeconds: 600,
			}),
		).toEqual({
			enabled: true,
			ttlSeconds: 60,
			source: "request",
		});
	});

	it("clamps TTLs into the supported range", () => {
		expect(clampResponseCacheTtlSeconds(5)).toBe(30);
		expect(clampResponseCacheTtlSeconds(90_000)).toBe(86_400);
	});

	it("returns disabled when an upstream layer opts out", () => {
		expect(
			resolveResponseCachePolicy({
				presetTtlSeconds: 120,
				presetDisabled: true,
			}),
		).toEqual({
			enabled: false,
			ttlSeconds: null,
			source: "disabled",
		});
	});

	it("falls back to the platform default when no explicit TTL is provided", () => {
		expect(resolveResponseCachePolicy({})).toEqual({
			enabled: true,
			ttlSeconds: 300,
			source: "platform_default",
		});
	});

	it("builds cache records with expiry metadata", () => {
		const record = buildCachedResponseRecord({
			key: "gateway:response-cache:v1:ws_123:abc123",
			fingerprint: "abc123",
			endpoint: "responses",
			model: "openai/gpt-5.4-nano",
			statusCode: 200,
			responseBody: { id: "resp_123" },
			providerId: "openai",
			ttlSeconds: 120,
			now: new Date("2026-05-09T12:00:00.000Z"),
		});

		expect(record.createdAt).toBe("2026-05-09T12:00:00.000Z");
		expect(record.expiresAt).toBe("2026-05-09T12:02:00.000Z");
		expect(record.providerId).toBe("openai");
	});
});
