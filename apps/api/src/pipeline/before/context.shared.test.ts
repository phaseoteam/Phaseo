import { describe, expect, it } from "vitest";
import {
	computeAdaptiveTtlForDynamic,
	computeStaticTtl,
	hasConfiguredKeyLimits,
	isDynamicContextLike,
	isStaticContextLike,
	mergeCachedContext,
	normalizeCapabilityStatus,
	normalizeProviderStatus,
	normalizeRoutingStatus,
	splitContextForCache,
	supportsEndpointViaModalities,
} from "./context.shared";

describe("credit cache composition", () => {
    it("preserves workspace source deadlines across splits and refuses expired compositions", () => {
        const deadline = Date.now() + 1000;
        const value = { workspaceId:"workspace", key:{ok:true}, keyLimit:{ok:true}, credit:{ok:true}, providers:[],pricing:{},workspaceRuntimeExpiresAt:deadline };
        const parts = splitContextForCache(value);
        expect(parts.dynamic.workspaceRuntimeExpiresAt).toBe(deadline);
        expect(parts.static.workspaceRuntimeExpiresAt).toBe(deadline);
        expect(mergeCachedContext({...parts,endpoint:"responses"}).workspaceRuntimeExpiresAt).toBe(deadline);
        expect(isDynamicContextLike(parts.dynamic)).toBe(true);
        expect(isStaticContextLike(parts.static)).toBe(true);
        expect(isDynamicContextLike({...parts.dynamic,workspaceRuntimeExpiresAt:Date.now()})).toBe(false);
        expect(isStaticContextLike({...parts.static,workspaceRuntimeExpiresAt:Date.now()})).toBe(false);
        expect(mergeCachedContext({...parts,dynamic:{...parts.dynamic,workspaceRuntimeExpiresAt:deadline-100},endpoint:"responses"}).workspaceRuntimeExpiresAt).toBe(deadline-100);
    });
	const teamEnrichment = {
		tier: "basic",
		created_at: "2026-01-01T00:00:00.000Z",
		account_age_days: 1,
		balance_nanos: 5_000_000_000,
		balance_usd: 5,
		balance_is_low: false,
		total_requests: 1,
		total_spend_nanos: 1,
		total_spend_usd: 0,
		spend_24h_nanos: 1,
		spend_24h_usd: 0,
		spend_7d_nanos: 1,
		spend_7d_usd: 0,
		spend_30d_nanos: 1,
		spend_30d_usd: 0,
		requests_1h: 1,
		requests_24h: 1,
	};

	it("keeps observational team enrichment in dynamic context", () => {
		const split = splitContextForCache({
			workspaceId: "workspace_123",
			key: { ok: true, reason: null, resetAt: null },
			keyLimit: { ok: true, reason: null, resetAt: null },
			credit: { ok: true, reason: null, resetAt: null, balanceNanos: 5_000_000_000 },
			providers: [],
			pricing: {},
			teamEnrichment,
		} as any);

		expect(split.dynamic.teamEnrichment).toEqual(teamEnrichment);
	});

	it("does not fall back to stale credit embedded in a legacy dynamic entry", () => {
		expect(() => mergeCachedContext({
			dynamic: {
				workspaceId: "workspace_123",
				key: { ok: true, reason: null, resetAt: null },
				keyLimit: { ok: true, reason: null, resetAt: null },
				credit: { ok: true, reason: null, resetAt: null, balanceNanos: 5_000_000_000 },
			},
			static: {
				workspaceId: "workspace_123",
				resolvedModel: "openai/gpt-5.4-nano",
				preset: null,
				providers: [],
				pricing: {},
				testingMode: false,
			},
			credit: null,
			endpoint: "chat.completions",
		})).toThrow("gateway_context_credit_cache_missing");
	});
});

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

	it("uses the minimum KV TTL whenever a workspace budget is configured", () => {
		const keyLimit = { ok: true, budgets: [{ id: "budget_1" }] } as any;
		expect(hasConfiguredKeyLimits(keyLimit)).toBe(true);
		expect(computeAdaptiveTtlForDynamic({
			key: { ok: true },
			credit: { ok: true, balanceNanos: 500_000_000_000 },
			keyLimit,
		} as any)).toBe(60);
	});
});

describe("fail-closed rollout status normalization", () => {
	it("does not treat missing or unknown provider status as active", () => {
		expect(normalizeProviderStatus(undefined)).toBe("not_ready");
		expect(normalizeProviderStatus("unexpected")).toBe("not_ready");
	});

	it("preserves the external provider status for explicit routing checks", () => {
		expect(normalizeProviderStatus("external")).toBe("external");
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

describe("computeStaticTtl", () => {
	const nowMs = Date.parse("2026-07-20T05:00:00Z");
	const contextWithBoundary = (effectiveTo: string | null) => ({
		pricing: {
			deepseek: {
				provider: "deepseek",
				model: "deepseek/deepseek-v4-pro",
				endpoint: "text.generate",
				effective_from: null,
				effective_to: effectiveTo,
				currency: "USD" as const,
				version: null,
				rules: [],
			},
		},
	});

	it("uses the normal static TTL when no pricing boundary is pending", () => {
		expect(computeStaticTtl(contextWithBoundary(null), nowMs)).toBe(600);
	});

	it("expires static pricing at the next effective boundary", () => {
		expect(
			computeStaticTtl(contextWithBoundary("2026-07-20T05:05:00Z"), nowMs),
		).toBe(300);
	});

	it("bypasses static caching inside the Workers KV minimum TTL", () => {
		expect(
			computeStaticTtl(contextWithBoundary("2026-07-20T05:00:30Z"), nowMs),
		).toBeNull();
	});
});
