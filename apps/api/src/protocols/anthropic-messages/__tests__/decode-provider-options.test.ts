// provider_options, reasoning and service_tier on /v1/messages (simulator finding N11).
import { describe, expect, it } from "vitest";
import { decodeAnthropicMessagesRequest } from "../decode";

const base = {
	model: "anthropic/claude-sonnet-5",
	max_tokens: 256,
	messages: [{ role: "user" as const, content: "Hello" }],
};

describe("decodeAnthropicMessagesRequest provider_options", () => {
	it("applies provider_options the way Chat and Responses do", () => {
		const ir = decodeAnthropicMessagesRequest({
			...base,
			provider_options: {
				anthropic: { cache_control: { type: "ephemeral", scope: "agent" } },
				google: { cached_content: "cachedContents/abc" },
				openai: { prompt_cache_retention: "24h", prompt_cache_options: { mode: "explicit" } },
				xai: { conversation_id: "conv_1" },
				deepinfra: { min_p: 0.1 },
			},
		});
		expect(ir.anthropicCacheControl).toEqual({ type: "ephemeral", scope: "agent" });
		expect(ir.googleCachedContent).toBe("cachedContents/abc");
		expect(ir.promptCacheRetention).toBe("24h");
		expect(ir.promptCacheOptions).toEqual({ mode: "explicit" });
		expect(ir.xaiConversationId).toBe("conv_1");
		expect(ir.vendor).toEqual({ deepinfra: { min_p: 0.1 } });
	});

	it("decodes the documented reasoning object", () => {
		const ir = decodeAnthropicMessagesRequest({ ...base, reasoning: { effort: "high", summary: "detailed", max_tokens: 2048 } });
		expect(ir.reasoning).toMatchObject({ effort: "high", summary: "detailed", maxTokens: 2048 });
	});

	it("keeps service_tier auto for providers and maps standard_only to the standard tier", () => {
		expect(decodeAnthropicMessagesRequest({ ...base, service_tier: "auto" }).serviceTier).toBe("auto");
		expect(decodeAnthropicMessagesRequest({ ...base, service_tier: "standard_only" }).serviceTier).toBe("standard");
	});
});
