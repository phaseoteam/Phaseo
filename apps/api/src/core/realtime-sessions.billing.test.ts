import { describe, expect, it } from "vitest";
import { computeBill } from "@pipeline/pricing/engine";
import type { PriceCard, PriceRule } from "@pipeline/pricing/types";
import {
	assertRealtimeBillingMetersPresent,
	assertRealtimeSettlementAuthority,
	buildGoogleRealtimeAuthTokenRequest,
	decideRealtimeRelayBudget,
	normalizeRealtimeUsage,
	pcm16Base64DurationMs,
	realtimeMaxDurationSeconds,
	resolveRealtimeFinalCostNanos,
} from "./realtime-sessions";

function makeCard(args: {
	provider: string;
	model: string;
	rules: Array<Partial<PriceRule> & Pick<PriceRule, "meter" | "unit" | "unit_size" | "price_per_unit">>;
}): PriceCard {
	return {
		provider: args.provider,
		model: args.model,
		endpoint: "audio.realtime",
		effective_from: null,
		effective_to: null,
		currency: "USD",
		version: null,
		rules: args.rules.map((rule, index) => ({
			pricing_plan: "standard",
			currency: "USD",
			match: [],
			priority: 100 - index,
			...rule,
		})) as PriceRule[],
	};
}

function totalNanos(priced: Record<string, unknown>): number {
	const pricing = priced.pricing as Record<string, unknown> | undefined;
	return Number(pricing?.total_nanos ?? 0);
}

function pricedLine(priced: Record<string, unknown>, dimension: string) {
	const pricing = priced.pricing as Record<string, unknown> | undefined;
	const lines = Array.isArray(pricing?.lines) ? pricing.lines as Array<Record<string, unknown>> : [];
	return lines.find((line) => line.dimension === dimension);
}

describe("realtime voice billing simulation", () => {
	it("ignores client supplied final cost overrides for public settlement", () => {
		expect(resolveRealtimeFinalCostNanos({
			auth: { internal: false },
			finalCostNanos: 0,
			pricedCostNanos: 123_456_789,
		})).toBe(123_456_789);
		expect(resolveRealtimeFinalCostNanos({
			auth: {},
			finalCostNanos: 0,
			pricedCostNanos: 123_456_789,
		})).toBe(123_456_789);
		expect(resolveRealtimeFinalCostNanos({
			auth: { internal: true },
			finalCostNanos: 0,
			pricedCostNanos: 123_456_789,
		})).toBe(0);
	});

	it("only allows internal workers to settle realtime sessions", () => {
		expect(() => assertRealtimeSettlementAuthority({ internal: false }))
			.toThrow("realtime_settlement_internal_only");
		expect(() => assertRealtimeSettlementAuthority({})).toThrow(
			"realtime_settlement_internal_only",
		);
		expect(() => assertRealtimeSettlementAuthority({ internal: true })).not.toThrow();
	});

	it("caps Google sessions until upstream resumption is supported", () => {
		expect(realtimeMaxDurationSeconds("google-ai-studio")).toBe(15 * 60);
		expect(realtimeMaxDurationSeconds("openai")).toBe(25 * 60);
		expect(realtimeMaxDurationSeconds("x-ai")).toBe(25 * 60);
	});

	it("calculates PCM16 audio duration from payload bytes, not client metadata", () => {
		const oneSecondAt24k = Buffer.alloc(24_000 * 2).toString("base64");
		const oneSecondAt16k = Buffer.alloc(16_000 * 2).toString("base64");

		expect(pcm16Base64DurationMs(oneSecondAt24k, 24_000)).toBe(1_000);
		expect(pcm16Base64DurationMs(oneSecondAt16k, 16_000)).toBe(1_000);
		expect(pcm16Base64DurationMs("", 24_000)).toBe(0);
	});

	it("requests realtime hold extension before the reserved budget is exhausted", () => {
		expect(decideRealtimeRelayBudget({
			reservedNanos: 5_000_000_000,
			estimatedCostNanos: 3_900_000_000,
		})).toMatchObject({ action: "none" });
		expect(decideRealtimeRelayBudget({
			reservedNanos: 5_000_000_000,
			estimatedCostNanos: 4_000_000_000,
		})).toMatchObject({
			action: "extend",
			targetReservedNanos: 10_000_000_000,
		});
	});

	it("builds Google Live ephemeral token requests against the v1alpha create endpoint", () => {
		const request = buildGoogleRealtimeAuthTokenRequest(Date.parse("2026-07-07T10:00:00.000Z"));

		expect(request).toEqual({
			url: "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
			body: {
				uses: 1,
				expireTime: "2026-07-07T10:30:00.000Z",
				newSessionExpireTime: "2026-07-07T10:01:00.000Z",
			},
		});
	});

	it("can constrain Google Live ephemeral tokens to voice-only realtime config", () => {
		const request = buildGoogleRealtimeAuthTokenRequest(
			Date.parse("2026-07-07T10:00:00.000Z"),
			{
				model: "gemini-3.1-flash-live-preview",
				voice: "Kore",
				instructions: "Keep replies concise.",
			},
		);

		expect(request.body).toMatchObject({
			uses: 1,
			bidiGenerateContentSetup: {
				model: "models/gemini-3.1-flash-live-preview",
				generationConfig: {
					responseModalities: ["AUDIO"],
					temperature: 0.7,
					speechConfig: {
						voiceConfig: {
							prebuiltVoiceConfig: {
								voiceName: "Kore",
							},
						},
					},
				},
				systemInstruction: {
					parts: [{ text: "Keep replies concise." }],
				},
				inputAudioTranscription: {},
				outputAudioTranscription: {},
				contextWindowCompression: {
					slidingWindow: {},
				},
				realtimeInputConfig: {
					automaticActivityDetection: {
						disabled: false,
						silenceDurationMs: 1100,
						prefixPaddingMs: 300,
					},
				},
			},
		});
	});

	it("prices xAI realtime from streamed audio minutes plus optional text messages", () => {
		const card = makeCard({
			provider: "x-ai",
			model: "x-ai/grok-voice-latest",
			rules: [
				{ meter: "audio_minutes", unit: "minute", unit_size: 1, price_per_unit: "0.05" },
				{ meter: "input_text_messages", unit: "message", unit_size: 1, price_per_unit: "0.004" },
			],
		});

		const usage = normalizeRealtimeUsage({
			input_audio_ms: 90_000,
			output_audio_ms: 30_000,
			input_text_messages: 2,
		});
		const priced = computeBill(usage, card, { endpoint: "audio.realtime" });

		expect(usage).toMatchObject({
			input_audio_seconds: 90,
			output_audio_seconds: 30,
			audio_seconds: 120,
			input_audio_minutes: 1.5,
			output_audio_minutes: 0.5,
			audio_minutes: 2,
			input_text_messages: 2,
		});
		expect(totalNanos(priced)).toBe(108_000_000);
		expect(pricedLine(priced, "audio_minutes")).toMatchObject({
			quantity: 2,
			line_nanos: 100_000_000,
		});
		expect(pricedLine(priced, "input_text_messages")).toMatchObject({
			quantity: 2,
			line_nanos: 8_000_000,
		});
	});

	it("prices Google Live from provider token meters only", () => {
		const card = makeCard({
			provider: "google-ai-studio",
			model: "google/gemini-3.1-flash-live-preview",
			rules: [
				{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.75" },
				{ meter: "input_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "3" },
				{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "4.5" },
				{ meter: "output_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "12" },
			],
		});

		const usage = normalizeRealtimeUsage({
			input_text_tokens: 1_000,
			usageMetadata: {
				promptTokensDetails: [{ modality: "AUDIO", tokenCount: 1_500 }],
				responseTokensDetails: [{ modality: "AUDIO", tokenCount: 300 }],
			},
			input_audio_ms: 60_000,
			output_audio_ms: 12_000,
		});
		const priced = computeBill(usage, card, { endpoint: "audio.realtime" });

		expect(usage).toMatchObject({
			input_text_tokens: 1_000,
			input_audio_seconds: 60,
			output_audio_seconds: 12,
			input_audio_minutes: 1,
			output_audio_minutes: 0.2,
			input_audio_tokens: 1_500,
			output_audio_tokens: 300,
		});
		expect(totalNanos(priced)).toBe(8_850_000);
		expect(pricedLine(priced, "input_text_tokens")).toMatchObject({
			quantity: 1_000,
			line_nanos: 750_000,
		});
		expect(pricedLine(priced, "input_audio_tokens")).toMatchObject({
			quantity: 1_500,
			line_nanos: 4_500_000,
		});
		expect(pricedLine(priced, "output_audio_tokens")).toMatchObject({
			quantity: 300,
			line_nanos: 3_600_000,
		});
		expect(pricedLine(priced, "input_audio_minutes")).toBeUndefined();

		const durationOnlyUsage = normalizeRealtimeUsage({
			input_audio_ms: 60_000,
			output_audio_ms: 12_000,
		});
		expect(durationOnlyUsage.input_audio_tokens).toBeUndefined();
		expect(durationOnlyUsage.output_audio_tokens).toBeUndefined();
		expect(() =>
			assertRealtimeBillingMetersPresent({
				provider: "google-ai-studio",
				usage: durationOnlyUsage,
				costNanos: 0,
			}),
		).toThrow("google-ai-studio_realtime_usage_missing_token_meters");
		expect(() =>
			assertRealtimeBillingMetersPresent({
				provider: "openai",
				usage: { assistant_response_in_flight: true },
				costNanos: 0,
			}),
		).toThrow("openai_realtime_authoritative_usage_pending");
		expect(() =>
			assertRealtimeBillingMetersPresent({
				provider: "openai",
				usage: {
					assistant_response_in_flight: true,
					input_audio_tokens: 10_000,
					output_audio_tokens: 10_000,
				},
				costNanos: 1_000_000_000,
			}),
		).toThrow("openai_realtime_authoritative_usage_pending");
	});

	it("prices OpenAI realtime from authoritative usage events with cached input separated", () => {
		const card = makeCard({
			provider: "openai",
			model: "openai/gpt-realtime-2",
			rules: [
				{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "4" },
				{ meter: "cached_read_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.4" },
				{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "24" },
				{ meter: "input_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "32" },
				{ meter: "cached_read_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.4" },
				{ meter: "output_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "64" },
			],
		});

		const usage = normalizeRealtimeUsage({
			input_token_details: {
				text_tokens: 1_000,
				audio_tokens: 2_000,
				cached_tokens_details: {
					text_tokens: 400,
					audio_tokens: 100,
				},
			},
			output_token_details: {
				text_tokens: 100,
				audio_tokens: 300,
			},
		});
		const priced = computeBill(usage, card, { endpoint: "audio.realtime" });

		expect(usage).toMatchObject({
			input_text_tokens: 600,
			cached_read_text_tokens: 400,
			input_audio_tokens: 1_900,
			cached_read_audio_tokens: 100,
			output_text_tokens: 100,
			output_audio_tokens: 300,
		});
		expect(totalNanos(priced)).toBe(85_000_000);
	});
});
