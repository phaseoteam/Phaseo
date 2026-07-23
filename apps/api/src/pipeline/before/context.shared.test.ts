import { describe, expect, it } from "vitest";
import {
	computeAdaptiveTtlForDynamic,
	hasConfiguredKeyLimits,
	normalizeCapabilityStatus,
	normalizeProviderStatus,
	normalizeRoutingStatus,
	supportsEndpointViaModalities,
} from "./context.shared";

describe("key limit cache policy", () => {
	it("detects request and spend caps across every supported window", () => {
		const unlimited = { buckets: {
			daily: { requestsLimit: 0, costLimitNanos: 0 },
			weekly: { requestsLimit: 0, costLimitNanos: 0 },
			monthly: { requestsLimit: 0, costLimitNanos: 0 },
		} } as any;
		expect(hasConfiguredKeyLimits(unlimited)).toBe(false);

		for (const window of ["daily", "weekly", "monthly"] as const) {
			expect(hasConfiguredKeyLimits({
				...unlimited,
				buckets: {
					...unlimited.buckets,
					[window]: { requestsLimit: 1, costLimitNanos: 0 },
				},
			} as any)).toBe(true);
			expect(hasConfiguredKeyLimits({
				...unlimited,
				buckets: {
					...unlimited.buckets,
					[window]: { requestsLimit: 0, costLimitNanos: 1 },
				},
			} as any)).toBe(true);
		}
	});

	it("uses the minimum KV TTL whenever a key has a configured cap", () => {
		expect(computeAdaptiveTtlForDynamic({
			key: { ok: true },
			credit: { ok: true, balanceNanos: 500_000_000_000 },
			keyLimit: {
				ok: true,
				buckets: {
					daily: {
						requestsUsed: 1,
						requestsLimit: 10_000,
						costUsedNanos: 0,
						costLimitNanos: 0,
					},
				},
			},
		} as any)).toBe(60);
	});
});

describe("fail-closed rollout status normalization", () => {
	it("does not treat missing or unknown provider status as active", () => {
		expect(normalizeProviderStatus(undefined)).toBe("not_ready");
		expect(normalizeProviderStatus("unexpected")).toBe("not_ready");
	});

	it("does not treat missing or unknown routing status as active", () => {
		expect(normalizeRoutingStatus(undefined)).toBe("disabled");
		expect(normalizeRoutingStatus("unexpected")).toBe("disabled");
		expect(normalizeCapabilityStatus(undefined)).toBe("disabled");
	});
});

describe("supportsEndpointViaModalities", () => {
	it("treats audio subtypes as audio output for audio.speech", () => {
		expect(
			supportsEndpointViaModalities({
				endpoint: "audio.speech",
				inputModalities: new Set(["text"]),
				outputModalities: new Set(["audio_tts"]),
			}),
		).toBe(true);
	});

	it("treats audio subtypes as audio output for music.generate", () => {
		expect(
			supportsEndpointViaModalities({
				endpoint: "music.generate",
				inputModalities: new Set(["text"]),
				outputModalities: new Set(["audio_music"]),
			}),
		).toBe(true);
	});

	it("does not treat transcription audio subtypes as generated audio output", () => {
		expect(
			supportsEndpointViaModalities({
				endpoint: "audio.speech",
				inputModalities: new Set(["text"]),
				outputModalities: new Set(["audio_stt"]),
			}),
		).toBe(false);
	});
});
