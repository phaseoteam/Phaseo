import { describe, expect, it } from "vitest";
import {
	estimateProviderTokenReservation,
	parseProviderRateLimitConfig,
	resolveProviderRateLimitDenial,
} from "./provider-rate-limits";

describe("provider rate-limit configuration", () => {
	it("normalizes an enabled database row", () => {
		expect(parseProviderRateLimitConfig({
			provider_id: "openai",
			requests_per_minute: 500,
			requests_per_day: null,
			tokens_per_minute: "100000",
			tokens_per_day: null,
			headroom_bps: 500,
			enabled: true,
		})).toEqual({
			providerId: "openai",
			requestsPerMinute: 500,
			requestsPerDay: null,
			tokensPerMinute: 100000,
			tokensPerDay: null,
			headroomBps: 500,
		});
	});

	it("ignores disabled rows and rows without a limit", () => {
		expect(parseProviderRateLimitConfig({ provider_id: "openai", enabled: false })).toBeNull();
		expect(parseProviderRateLimitConfig({ provider_id: "openai", enabled: true })).toBeNull();
	});

	it("uses the latest reset when minute and daily limits are both exhausted", () => {
		const nowMs = Date.UTC(2026, 8, 3, 12, 30, 0);
		const minuteWindow = Math.floor(nowMs / 60_000);
		const dayWindow = Math.floor(nowMs / 86_400_000);
		expect(resolveProviderRateLimitDenial({
			providerId: "openai",
			requestsPerMinute: 10,
			requestsPerDay: 100,
			tokensPerMinute: null,
			tokensPerDay: null,
			headroomBps: 500,
		}, {
			minuteWindow,
			dayWindow,
			minuteRequests: 10,
			dayRequests: 100,
			minuteTokens: 0,
			dayTokens: 0,
		}, nowMs)).toEqual({
			allowed: false,
			reason: "requests_per_day",
			retryAfterSeconds: 41_400,
			reservation: null,
		});
	});

	it("denies a concurrent token reservation that would exceed effective capacity", () => {
		const nowMs = Date.UTC(2026, 8, 3, 12, 30, 0);
		const counters = {
			minuteWindow: Math.floor(nowMs / 60_000),
			dayWindow: Math.floor(nowMs / 86_400_000),
			minuteRequests: 1,
			dayRequests: 1,
			minuteTokens: 600,
			dayTokens: 600,
		};
		const config = {
			providerId: "openai",
			requestsPerMinute: null,
			requestsPerDay: null,
			tokensPerMinute: 1_000,
			tokensPerDay: null,
			headroomBps: 500,
		};

		expect(resolveProviderRateLimitDenial(config, counters, nowMs, 350)).toBeNull();
		expect(resolveProviderRateLimitDenial(config, counters, nowMs, 351)).toEqual({
			allowed: false,
			reason: "tokens_per_minute",
			retryAfterSeconds: 60,
			reservation: null,
		});
	});

	it("reserves a conservative text input bound plus requested output", () => {
		const body = { model: "openai/test", messages: [{ role: "user", content: "hello" }], max_tokens: 200 };
		const inputUpperBound = new TextEncoder().encode(JSON.stringify(body)).byteLength + 16;
		expect(estimateProviderTokenReservation({
			capability: "text.generate",
			body,
			requestedMaxOutputTokens: 200,
			providerMaxInputTokens: 10_000,
			providerMaxOutputTokens: 4_096,
		})).toBe(inputUpperBound + 200);
	});

	it("uses provider bounds for omitted output caps and remote media inputs", () => {
		expect(estimateProviderTokenReservation({
			capability: "text.generate",
			body: { messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: "https://example.com/a.png" } }] }] },
			providerMaxInputTokens: 8_000,
			providerMaxOutputTokens: 2_000,
		})).toBe(10_000);
	});

	it("fails closed for token-consuming capabilities without a safe bound", () => {
		expect(estimateProviderTokenReservation({
			capability: "text.generate",
			body: { messages: [] },
			providerMaxInputTokens: null,
			providerMaxOutputTokens: null,
		})).toBeNull();
		expect(estimateProviderTokenReservation({
			capability: "audio.transcription",
			body: { file_url: "https://example.com/audio.mp3" },
			providerMaxInputTokens: 10_000,
			providerMaxOutputTokens: 1_000,
		})).toBeNull();
	});
});
