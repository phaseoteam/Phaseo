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
	priceRealtimeUsage,
	quoteRealtimeSessionRecovery,
	realtimeSessionPriceCard,
	realtimeMaxDurationSeconds,
	resolveRealtimeFinalCostNanos,
} from "./realtime-sessions";
import { googleUsageToAggregate } from "./realtime-relay-durable-object";

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
	it("meters the same PCM duration regardless of chunk boundaries", () => {
		const oneSample = Buffer.alloc(2).toString("base64");
		const whole = Buffer.alloc(4800).toString("base64");
		expect(pcm16Base64DurationMs(oneSample, 24000) * 2400).toBeCloseTo(pcm16Base64DurationMs(whole, 24000), 10);
	});
	it("preserves cached and uncached meters through relay, persistence, and settlement", () => {
		const normalized = normalizeRealtimeUsage({
			input_token_details: { text_tokens: 1000, audio_tokens: 2000,
				cached_tokens_details: { text_tokens: 400, audio_tokens: 100 } },
		});
		expect(normalized).toMatchObject({ input_text_tokens: 600, input_audio_tokens: 1900,
			cached_read_text_tokens: 400, cached_read_audio_tokens: 100 });
		expect(normalizeRealtimeUsage(normalized)).toEqual(normalized);
		expect(normalizeRealtimeUsage(normalizeRealtimeUsage(normalized))).toEqual(normalized);
	});
	it("bills OpenAI realtime image input and its cached part", () => {
		// gpt-realtime-2 production rows (per 1M tokens).
		const card = makeCard({ provider: "openai", model: "openai/gpt-realtime-2", rules: [
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "4" },
			{ meter: "input_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "32" },
			{ meter: "input_image_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "5" },
			{ meter: "cached_read_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.4" },
			{ meter: "cached_read_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.4" },
			{ meter: "cached_read_image_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.5" },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "24" },
			{ meter: "output_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "64" },
		] });
		const usage = normalizeRealtimeUsage({
			input_tokens: 4_000,
			input_token_details: { text_tokens: 1_000, audio_tokens: 1_000, image_tokens: 2_000,
				cached_tokens_details: { text_tokens: 0, audio_tokens: 0, image_tokens: 500 } },
			output_tokens: 100,
			output_token_details: { text_tokens: 100, audio_tokens: 0 },
		});
		expect(usage).toMatchObject({ input_image_tokens: 1_500, cached_read_image_tokens: 500 });
		const priced = priceRealtimeUsage(usage, card);
		// 1000×$4 + 1000×$32 + 1500×$5 + 500×$0.5 + 100×$24 per 1M = $0.04615. Before: $0.0384 (image dropped).
		expect(totalNanos(priced)).toBe(46_150_000);
	});

	it("bills Gemini Live image and video input, on the text meter while the card has no row for them", () => {
		const aggregate = googleUsageToAggregate({}, {
			promptTokensDetails: [
				{ modality: "TEXT", tokenCount: 1_000 },
				{ modality: "IMAGE", tokenCount: 2_000 },
				{ modality: "VIDEO", tokenCount: 3_000 },
			],
			responseTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }],
		});
		expect(aggregate).toMatchObject({ input_image_tokens: 2_000, input_video_tokens: 3_000 });
		const usage = normalizeRealtimeUsage(aggregate);
		const rules = [
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.75" },
			{ meter: "input_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "3" },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "4.5" },
			{ meter: "output_audio_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "12" },
		];
		// Production card today: image and video fold into input text ($0.75). Before: $0.00195 (text and audio out only).
		const today = priceRealtimeUsage(usage, makeCard({ provider: "google-ai-studio", model: "google/gemini-3.8-live", rules }));
		expect(totalNanos(today)).toBe(5_700_000);
		// With Google's $1.00 image/video rows added.
		const withRows = priceRealtimeUsage(usage, makeCard({ provider: "google-ai-studio", model: "google/gemini-3.8-live", rules: [
			...rules,
			{ meter: "input_image_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "1" },
			{ meter: "input_video_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "1" },
		] }));
		expect(totalNanos(withRows)).toBe(6_950_000);
	});

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

	it("lets a provider-reported cost raise but never lower the priced cost", () => {
		expect(resolveRealtimeFinalCostNanos({
			auth: { internal: true },
			providerCostNanos: 10_000_000,
			pricedCostNanos: 80_000_000,
		})).toBe(80_000_000);
		expect(resolveRealtimeFinalCostNanos({
			auth: { internal: true },
			providerCostNanos: 95_000_000,
			pricedCostNanos: 80_000_000,
		})).toBe(95_000_000);
		expect(resolveRealtimeFinalCostNanos({
			auth: { internal: false },
			providerCostNanos: 1,
			pricedCostNanos: 80_000_000,
		})).toBe(80_000_000);
	});

	it("only allows internal workers to settle realtime sessions", () => {
		expect(() => assertRealtimeSettlementAuthority({ internal: false }))
			.toThrow("realtime_settlement_internal_only");
		expect(() => assertRealtimeSettlementAuthority({})).toThrow(
			"realtime_settlement_internal_only",
		);
		expect(() => assertRealtimeSettlementAuthority({ internal: true })).not.toThrow();
	});

	it("allows OpenAI Realtime the provider's full 60 minutes", () => {
		expect(realtimeMaxDurationSeconds("openai")).toBe(60 * 60);
		expect(realtimeMaxDurationSeconds("openai", "openai/gpt-realtime-2")).toBe(60 * 60);
		expect(realtimeMaxDurationSeconds("openai", "openai/gpt-live-1")).toBe(25 * 60);
	});

	it("caps each provider at its own session limit", () => {
		// Google: one hour across resumed connections; xAI per its docs.
		expect(realtimeMaxDurationSeconds("google-ai-studio")).toBe(60 * 60);
		expect(realtimeMaxDurationSeconds("x-ai")).toBe(120 * 60);
		expect(realtimeMaxDurationSeconds("spacex-ai")).toBe(120 * 60);
		expect(realtimeMaxDurationSeconds("openai", "openai/gpt-live-1")).toBe(25 * 60);
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

	it("enables low background reasoning for Gemini 3.8 Live Extended Thinking", () => {
		const request = buildGoogleRealtimeAuthTokenRequest(
			Date.parse("2026-09-15T10:00:00.000Z"),
			{ model: "gemini-3.8-live-extended-thinking" },
		);

		expect(request.body).toMatchObject({
			bidiGenerateContentSetup: {
				model: "models/gemini-3.8-live-extended-thinking",
				generationConfig: {
					thinkingConfig: { thinkingLevel: "LOW" },
				},
			},
		});
	});

	it("does not send a configurable thinking level to standard Gemini 3.8 Live", () => {
		const request = buildGoogleRealtimeAuthTokenRequest(
			Date.parse("2026-09-15T10:00:00.000Z"),
			{ model: "gemini-3.8-live" },
		);

		expect(request.body).toMatchObject({
			bidiGenerateContentSetup: {
				model: "models/gemini-3.8-live",
			},
		});
		expect(request.body.bidiGenerateContentSetup?.generationConfig).not.toHaveProperty(
			"thinkingConfig",
		);
	});

	it("forwards the selected Gemini 3.8 Live Extended Thinking level", () => {
		const request = buildGoogleRealtimeAuthTokenRequest(
			Date.parse("2026-09-15T10:00:00.000Z"),
			{ model: "gemini-3.8-live-extended-thinking", thinkingLevel: "high" },
		);

		expect(request.body).toMatchObject({
			bidiGenerateContentSetup: {
				generationConfig: {
					thinkingConfig: { thinkingLevel: "HIGH" },
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

	it("accepts relay-estimated settlements but never an in-flight response", () => {
		const usage = { input_audio_seconds: 2, input_audio_tokens: 0, billing_estimated: true };
		expect(() => assertRealtimeBillingMetersPresent({ provider: "google-ai-studio", usage, costNanos: 0 }))
			.toThrow("usage_missing_token_meters");
		expect(() => assertRealtimeBillingMetersPresent({ provider: "google-ai-studio", usage, costNanos: 0, estimated: true }))
			.not.toThrow();
		expect(() => assertRealtimeBillingMetersPresent({
			provider: "openai",
			usage: { assistant_response_in_flight: true },
			costNanos: 0,
			estimated: true,
		})).toThrow("authoritative_usage_pending");
	});

	it("prices an xAI server VAD session by connected duration, not audio sent plus received", () => {
		const card = makeCard({
			provider: "spacex-ai",
			model: "spacex-ai/grok-voice-think-fast-2.0",
			rules: [{ meter: "audio_minutes", unit: "minute", unit_size: 1, price_per_unit: "0.08" }],
		});
		// 90 s connected; the client streamed 90 s of microphone audio while 30 s of reply played.
		const usage = normalizeRealtimeUsage({ input_audio_ms: 90_000, output_audio_ms: 30_000, session_audio_ms: 90_000, audio_ms: 90_000 });
		expect(totalNanos(computeBill(usage, card, { endpoint: "audio.realtime" }))).toBe(120_000_000);
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

describe("realtime price cards", () => {
	const tokenRules = (["input_text_tokens", "input_audio_tokens", "output_text_tokens", "output_audio_tokens"] as const)
		.map((meter) => ({ meter, unit: "token" as const, unit_size: 1_000_000, price_per_unit: "10" }));
	const openaiCard = makeCard({ provider: "openai", model: "openai/gpt-realtime-2.1", rules: tokenRules });

	it("fails instead of billing a provider's charged meter at $0 when its card has no price for it", () => {
		const card = makeCard({ provider: "openai", model: "openai/gpt-realtime-2.1", rules: tokenRules.slice(0, 3) });
		expect(() => priceRealtimeUsage({ output_audio_tokens: 1_000 }, card, "openai"))
			.toThrow("realtime_price_rule_missing:output_audio_tokens");
		// Meters the provider doesn't charge for (minutes on a token-billed call) stay informational.
		expect(totalNanos(priceRealtimeUsage({ input_audio_tokens: 1_000_000, audio_minutes: 2 }, openaiCard, "openai")))
			.toBe(10_000_000_000);
		const xaiCard = makeCard({ provider: "spacex-ai", model: "spacex-ai/grok-voice-3.0", rules: [
			{ meter: "audio_minutes", unit: "minute", unit_size: 1, price_per_unit: "0.05" }] });
		expect(totalNanos(priceRealtimeUsage({ audio_minutes: 2, output_text_tokens: 500 }, xaiCard, "spacex-ai")))
			.toBe(100_000_000);
	});

	it("bills with the card saved when the call started, not today's card", async () => {
		const saved = await realtimeSessionPriceCard("openai", { model_id: "openai/gpt-realtime-2.1", metadata: { price_card: openaiCard } });
		expect(saved).toBe(openaiCard);
	});

	it("quotes a review from recorded usage and marks it complete only when nothing is outstanding", async () => {
		const session = { model_id: "openai/gpt-realtime-2.1", provider: "openai", metadata: { price_card: openaiCard } };
		const done = await quoteRealtimeSessionRecovery({ ...session, usage: { input_audio_tokens: 100_000, output_audio_tokens: 200_000 } });
		expect(done).toMatchObject({ costNanos: 3_000_000_000, complete: true });
		const inFlight = await quoteRealtimeSessionRecovery({ ...session,
			usage: { input_audio_tokens: 100_000, output_audio_tokens: 200_000, assistant_response_in_flight: true } });
		expect(inFlight.complete).toBe(false);

		const elevenCard = makeCard({ provider: "elevenlabs", model: "eleven-labs/eleven-realtime-v1-mini", rules: [
			{ meter: "audio_minutes", unit: "minute", unit_size: 1, price_per_unit: "0.08" },
			{ meter: "input_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "0.2" },
			{ meter: "output_text_tokens", unit: "token", unit_size: 1_000_000, price_per_unit: "6" }] });
		const eleven = { model_id: "eleven-labs/eleven-realtime-v1-mini", provider: "elevenlabs", metadata: { price_card: elevenCard } };
		// Until ElevenLabs reports the conversation, an admin decides.
		expect((await quoteRealtimeSessionRecovery({ ...eleven, usage: { session_audio_ms: 60_000, audio_ms: 60_000 } })).complete).toBe(false);
		// Its reported charge is a floor, as in normal settlement.
		const reported = await quoteRealtimeSessionRecovery({ ...eleven, usage: { session_audio_ms: 60_000, audio_ms: 60_000,
			provider_cost_status: "reconciled", provider_cost_nanos: 150_000_000 } });
		expect(reported).toMatchObject({ complete: true, costNanos: 150_000_000 });
	});
});
