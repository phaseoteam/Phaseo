import { describe, expect, it } from "vitest";
import { deriveCachePricingContext } from "./cache-context";

describe("deriveCachePricingContext", () => {
	it("normalizes openai prompt cache retention", () => {
		const context = deriveCachePricingContext({
			provider_options: {
				openai: {
					prompt_cache_retention: "1H",
				},
			},
		});

		expect(context.prompt_cache_retention).toBe("1H");
		expect(context.cache_ttl).toBe("1h");
		expect(context.cache_provider).toBe("openai");
		expect(context.cache_requested).toBe(true);
	});

	it("normalizes anthropic cache control", () => {
		const context = deriveCachePricingContext({
			providerOptions: {
				anthropic: {
					cacheControl: {
						type: "ephemeral",
						ttl: "5m",
					},
				},
			},
		});

		expect(context.anthropic_cache_control).toEqual({
			type: "ephemeral",
			ttl: "5m",
		});
		expect(context.cache_ttl).toBe("5m");
		expect(context.cache_provider).toBe("anthropic");
	});

	it("normalizes google explicit cache hints", () => {
		const context = deriveCachePricingContext({
			provider_options: {
				google: {
					cached_content: "cachedContents/session-1",
					cache_control: {
						type: "ephemeral",
						ttl: "1H",
					},
				},
			},
		});

		expect(context.google_cached_content).toBe("cachedContents/session-1");
		expect(context.google_cache_control).toEqual({
			type: "ephemeral",
			ttl: "1H",
		});
		expect(context.google_cache_ttl).toBe("1h");
		expect(context.cache_ttl).toBe("1h");
		expect(context.cache_provider).toBe("google");
	});


	it("normalizes top-level cache aliases", () => {
		const context = deriveCachePricingContext({
			cache_control: {
				type: "ephemeral",
				ttl: "5M",
			},
			cached_content: "cachedContents/top-level",
		});

		expect(context.cache_ttl).toBe("5m");
		expect(context.google_cache_control).toEqual({ type: "ephemeral", ttl: "5M" });
		expect(context.google_cached_content).toBe("cachedContents/top-level");
		expect(context.cache_provider).toBe("google");
		expect(context.cache_requested).toBe(true);
	});

	it("normalizes top-level xai conversation affinity", () => {
		const context = deriveCachePricingContext({
			conversation_id: "conv_top",
		});

		expect(context.xai_conversation_id).toBe("conv_top");
		expect(context.cache_ttl).toBeUndefined();
		expect(context.cache_provider).toBe("xai");
		expect(context.cache_requested).toBe(true);
	});
	it("captures xai conversation affinity without ttl", () => {
		const context = deriveCachePricingContext({
			providerOptions: {
				"x-ai": {
					conversationId: "conv_abc",
				},
			},
		});

		expect(context.xai_conversation_id).toBe("conv_abc");
		expect(context.cache_ttl).toBeUndefined();
		expect(context.cache_provider).toBe("xai");
		expect(context.cache_requested).toBe(true);
	});
});
