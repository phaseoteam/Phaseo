import { describe, expect, it, vi } from "vitest";
import {
	googleUsageSnapshot,
	googleUsageToAggregate,
	mergeGoogleUsageSnapshot,
	validateRealtimeAudioIngress,
} from "./realtime-relay-durable-object";
import {
	admitRealtimeRelay,
	isRealtimeSessionId,
	realtimeRelaySecretFromProtocols,
	validateRealtimeMetadata,
} from "@/routes/v1/data/realtime-sessions";
import { isRealtimeRelaySecret } from "./realtime-sessions";

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
		expect(validateRealtimeAudioIngress({ base64: "AAAA==", sampleRate: 24_000, currentInputMs: 0, elapsedMs: 0 })).toEqual({ ok: false, reason: "realtime_audio_invalid_base64" });
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

	it("rejects malformed relay session identifiers before Durable Object lookup", () => {
		expect(isRealtimeSessionId("rt_01jz8h3j3f4q5r6s7t8v9w0xyz")).toBe(true);
		expect(isRealtimeSessionId("rt_01JZ8H3J3F4Q5R6S7T8V9W0XYZ")).toBe(false);
		expect(isRealtimeSessionId("arbitrary-object-name")).toBe(false);
		expect(isRealtimeSessionId("rt_01jz8h3j3f4q5r6s7t8v9w0xyi")).toBe(false);
	});

	it("rejects malformed relay secrets before database-backed claims", () => {
		const secret = `rtsec_${"01jz8h3j3f4q5r6s7t8v9w0xyz".repeat(2)}`;
		expect(isRealtimeRelaySecret(secret)).toBe(true);
		expect(realtimeRelaySecretFromProtocols(`statsync-realtime, rtsec.${secret}`)).toBe(secret);
		expect(realtimeRelaySecretFromProtocols("statsync-realtime, rtsec.forged")).toBeNull();
		expect(isRealtimeRelaySecret("rtsec_01jz8h3j3f4q5r6s7t8v9w0xyz")).toBe(false);
	});

	it("fails closed when the production relay rate limiter is unavailable", async () => {
		const request = new Request("https://phaseo.app/v1/realtime/sessions/relay", {
			headers: { "cf-connecting-ip": "203.0.113.4" },
		});
		expect(await admitRealtimeRelay(request, { ENV: "prod" } as never)).toBe(false);
		expect(await admitRealtimeRelay(request, { ENV: "test" } as never)).toBe(true);
	});

	it("uses the native limiter before admitting a relay", async () => {
		const limit = vi.fn().mockResolvedValue({ success: false });
		const request = new Request("https://phaseo.app/v1/realtime/sessions/relay", {
			headers: { "cf-connecting-ip": "203.0.113.4" },
		});
		expect(await admitRealtimeRelay(request, {
			ENV: "prod",
			REALTIME_RELAY_RATE_LIMITER: { limit },
		} as never)).toBe(false);
		expect(limit).toHaveBeenCalledOnce();
	});
});
