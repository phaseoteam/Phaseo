import { describe, expect, it } from "vitest";
import {
	googleUsageSnapshot,
	googleUsageToAggregate,
	mergeGoogleUsageSnapshot,
	validateRealtimeAudioIngress,
} from "./realtime-relay-durable-object";
import { validateRealtimeMetadata } from "@/routes/v1/data/realtime-sessions";

describe("realtime relay security boundaries", () => {
	const pcm = (durationMs: number, sampleRate = 24_000) =>
		Buffer.alloc(Math.round(sampleRate * (durationMs / 1_000)) * 2).toString("base64");

	it("accepts a paced PCM16 frame", () => {
		expect(validateRealtimeAudioIngress({
			base64: pcm(500),
			sampleRate: 24_000,
			currentInputMs: 1_000,
			elapsedMs: 1_000,
		})).toEqual({ ok: true, durationMs: 500 });
	});

	it("rejects malformed, oversized, and faster-than-realtime input", () => {
		expect(validateRealtimeAudioIngress({
			base64: "not base64!",
			sampleRate: 24_000,
			currentInputMs: 0,
			elapsedMs: 0,
		})).toEqual({ ok: false, reason: "realtime_audio_invalid_base64" });
		expect(validateRealtimeAudioIngress({
			base64: pcm(1_001),
			sampleRate: 24_000,
			currentInputMs: 0,
			elapsedMs: 0,
		})).toEqual({ ok: false, reason: "realtime_audio_chunk_too_large" });
		expect(validateRealtimeAudioIngress({
			base64: pcm(1_000),
			sampleRate: 24_000,
			currentInputMs: 2_000,
			elapsedMs: 0,
		})).toEqual({ ok: false, reason: "realtime_audio_rate_exceeded" });
	});

	it("accumulates Google turn usage and bills thinking as output text", () => {
		const first = googleUsageToAggregate({}, {
			promptTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }],
			responseTokensDetails: [{ modality: "AUDIO", tokenCount: 50 }],
			thoughtsTokenCount: 7,
		});
		const second = googleUsageToAggregate(first, {
			promptTokensDetails: [{ modality: "AUDIO", tokenCount: 40 }],
			responseTokensDetails: [{ modality: "TEXT", tokenCount: 3 }],
			thoughtsTokenCount: 2,
		});
		expect(second.input_audio_tokens).toBe(140);
		expect(second.output_audio_tokens).toBe(50);
		expect(second.output_text_tokens).toBe(12);
	});

	it("treats periodic Google usage for one turn as snapshots", () => {
		const early = googleUsageSnapshot({
			promptTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }],
			responseTokensDetails: [{ modality: "AUDIO", tokenCount: 20 }],
		});
		const final = googleUsageSnapshot({
			promptTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }],
			responseTokensDetails: [{ modality: "AUDIO", tokenCount: 50 }],
		});
		const turn = mergeGoogleUsageSnapshot(early, final);
		const aggregate = googleUsageToAggregate({}, {
			promptTokensDetails: [{ modality: "AUDIO", tokenCount: turn.input_audio_tokens }],
			responseTokensDetails: [{ modality: "AUDIO", tokenCount: turn.output_audio_tokens }],
		});

		expect(turn).toMatchObject({ input_audio_tokens: 100, output_audio_tokens: 50 });
		expect(aggregate).toMatchObject({ input_audio_tokens: 100, output_audio_tokens: 50 });
	});

	it("bounds user metadata by size, key count, and depth", () => {
		expect(validateRealtimeMetadata({ source: "chat", ui: { locale: "en" } })).toBe(true);
		expect(validateRealtimeMetadata({ value: "x".repeat(17_000) })).toBe(false);
		expect(validateRealtimeMetadata(Object.fromEntries(
			Array.from({ length: 33 }, (_, index) => [`k${index}`, index]),
		))).toBe(false);
		expect(validateRealtimeMetadata({ a: { b: { c: { d: { e: true } } } } })).toBe(false);
	});
});
