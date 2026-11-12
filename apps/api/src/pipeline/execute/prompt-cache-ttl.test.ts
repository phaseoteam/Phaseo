// OpenAI's 12-hour prompt cache: kept from the client request, sent only to routes that
// document it (OpenAI's Responses API, GPT-5.6 and later, with a 12-hour price row), removed
// and reported elsewhere, and preferred in routing.
// https://developers.openai.com/api/docs/guides/prompt-caching
import { describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { decodeOpenAIResponsesRequest } from "@protocols/openai-responses/decode";
import { irToOpenAIResponses } from "@executors/_shared/text-generate/openai-compat/transform";
import { irToOpenAIChat } from "@executors/_shared/text-generate/openai-compat/transform-chat";
import { normalizeIRForProvider } from "./normalize";
import { dropUnsupportedTwelveHourCache, preferTwelveHourCacheRoutes } from "./prompt-cache-ttl";
import type { DroppedParam } from "./unsupportedParams";

const TWELVE_HOUR_CARD = { rules: [{ meter: "input_text_tokens" }, { meter: "cached_write_text_tokens_12h" }] };
const NO_TWELVE_HOUR_CARD = { rules: [{ meter: "input_text_tokens" }, { meter: "cached_write_text_tokens" }] };

function responsesRequest(): IRChatRequest {
	return decodeOpenAIResponsesRequest({
		model: "openai/gpt-5.6-sol",
		input: [
			{
				role: "developer",
				content: [{ type: "input_text", text: "Shared tool manual", prompt_cache_breakpoint: { mode: "explicit", ttl: "12h" } }],
			},
			{
				role: "user",
				content: [{ type: "input_text", text: "Session notes", prompt_cache_breakpoint: { mode: "explicit", ttl: "30m" } }],
			},
		],
		prompt_cache_options: { mode: "explicit", ttl: "12h" },
	} as any);
}

describe("decoding OpenAI cache lifetimes", () => {
	it("keeps the breakpoint ttl and the request ttl from a Responses request", () => {
		const ir = responsesRequest();
		expect(ir.promptCacheOptions).toEqual({ mode: "explicit", ttl: "12h" });
		expect(ir.messages[0]).toMatchObject({
			content: [{ cacheControl: { type: "prompt_cache_breakpoint", mode: "explicit", ttl: "12h" } }],
		});
		expect(ir.messages[1]).toMatchObject({
			content: [{ cacheControl: { type: "prompt_cache_breakpoint", mode: "explicit", ttl: "30m" } }],
		});
	});

	it("keeps the breakpoint ttl from a Chat request", () => {
		const ir = decodeOpenAIChatRequest({
			model: "openai/gpt-5.6-sol",
			messages: [{ role: "user", content: [{ type: "text", text: "Manual", prompt_cache_breakpoint: { mode: "explicit", ttl: "12h" } }] }],
		} as any);
		expect(ir.messages[0]).toMatchObject({
			content: [{ cacheControl: { type: "prompt_cache_breakpoint", ttl: "12h" } }],
		});
	});
});

describe("serialising OpenAI cache lifetimes", () => {
	it("sends the 12-hour request and breakpoint lifetimes to OpenAI Responses", () => {
		const request = irToOpenAIResponses(responsesRequest(), "gpt-5.6-sol", "openai");
		expect(request.prompt_cache_options).toEqual({ mode: "explicit", ttl: "12h" });
		expect(request.input[0].content[0].prompt_cache_breakpoint).toEqual({ mode: "explicit", ttl: "12h" });
		expect(request.input[1].content[0].prompt_cache_breakpoint).toEqual({ mode: "explicit", ttl: "30m" });
	});

	it("sends Azure breakpoints without a lifetime and no 12-hour request lifetime", () => {
		const request = irToOpenAIResponses(responsesRequest(), "gpt-5.6-sol", "azure");
		expect(request.prompt_cache_options).toEqual({ mode: "explicit" });
		expect(request.input[0].content[0].prompt_cache_breakpoint).toEqual({ mode: "explicit" });
	});

	it("never turns an Anthropic-style cache_control ttl into an OpenAI breakpoint lifetime", () => {
		const ir = decodeOpenAIChatRequest({
			model: "openai/gpt-5.6-sol",
			messages: [{ role: "user", content: [{ type: "text", text: "Manual", cache_control: { type: "ephemeral", ttl: "1h" } }] }],
		} as any);
		const request = irToOpenAIChat(ir, "gpt-5.6-sol", "openai");
		expect(request.messages[0].content[0].prompt_cache_breakpoint).toEqual({ mode: "explicit" });
	});
});

describe("dropUnsupportedTwelveHourCache", () => {
	const expectedDrops: DroppedParam[] = [
		{ param: "prompt_cache_options.ttl", reason: "value_not_supported", source: "provider_api", clientSent: true },
		{ param: "prompt_cache_breakpoint.ttl", reason: "value_not_supported", source: "provider_api", clientSent: true },
	];

	it("keeps 12 hours on OpenAI for GPT-5.6 when the card prices 12-hour writes", () => {
		const ir = responsesRequest();
		const result = dropUnsupportedTwelveHourCache(ir, "openai", { models: ["gpt-5.6-sol"], pricingCard: TWELVE_HOUR_CARD });
		expect(result).toEqual({ ir, dropped: [] });
	});

	it.each([
		["azure", ["gpt-5.6-sol"], TWELVE_HOUR_CARD],
		["openai-eu", ["gpt-5.6-sol"], NO_TWELVE_HOUR_CARD],
		["openai", ["gpt-5.6-sol"], NO_TWELVE_HOUR_CARD],
		["openai", ["gpt-5.5"], TWELVE_HOUR_CARD],
		["amazon-bedrock", ["openai.gpt-5.6-sol"], NO_TWELVE_HOUR_CARD],
	])("removes 12 hours and reports it on %s %j", (providerId, models, pricingCard) => {
		const result = dropUnsupportedTwelveHourCache(responsesRequest(), providerId, { models, pricingCard });
		expect(result.dropped).toEqual(expectedDrops);
		expect(result.ir.promptCacheOptions).toEqual({ mode: "explicit" });
		expect((result.ir.messages[0] as any).content[0].cacheControl).toEqual({ type: "prompt_cache_breakpoint", mode: "explicit" });
		// A 30-minute breakpoint is not touched.
		expect((result.ir.messages[1] as any).content[0].cacheControl.ttl).toBe("30m");
	});

	it("reports the drop through normalizeIRForProvider and sends Azure no 12-hour lifetime", () => {
		const dropped: DroppedParam[] = [];
		const ir = normalizeIRForProvider(responsesRequest(), "azure", "openai.responses", {
			modelForReasoning: "gpt-5.6-sol",
			pricingCard: NO_TWELVE_HOUR_CARD,
			onDroppedParams: (entries) => dropped.push(...entries),
		});
		expect(dropped).toEqual(expectedDrops);
		const request = irToOpenAIResponses(ir, "gpt-5.6-sol", "azure");
		expect(JSON.stringify(request)).not.toContain("12h");
	});

	it("removes a 12-hour breakpoint inside a tool result", () => {
		const ir: IRChatRequest = {
			model: "openai/gpt-5.6-sol",
			messages: [{
				role: "tool",
				toolResults: [{
					toolCallId: "call_1",
					content: "result",
					cacheControl: { type: "prompt_cache_breakpoint", mode: "explicit", ttl: "12h" },
				}],
			}],
		};
		const result = dropUnsupportedTwelveHourCache(ir, "azure", { models: ["gpt-5.6-sol"] });
		expect(result.dropped.map((entry) => entry.param)).toEqual(["prompt_cache_breakpoint.ttl"]);
		expect((result.ir.messages[0] as any).toolResults[0].cacheControl).toEqual({ type: "prompt_cache_breakpoint", mode: "explicit" });
	});

	it("leaves requests without a 12-hour lifetime alone", () => {
		const ir: IRChatRequest = { model: "m", messages: [], promptCacheOptions: { ttl: "30m" } };
		expect(dropUnsupportedTwelveHourCache(ir, "azure", { models: ["gpt-5.6-sol"] })).toEqual({ ir, dropped: [] });
	});
});

describe("preferTwelveHourCacheRoutes", () => {
	const entry = (providerId: string, pricingCard = TWELVE_HOUR_CARD) => ({ candidate: { providerId, providerModelSlug: "gpt-5.6-sol", pricingCard } });
	const azure = entry("azure");
	const bedrock = entry("amazon-bedrock", NO_TWELVE_HOUR_CARD);
	const openai = entry("openai");

	it("puts the routes that take 12 hours first and keeps the rest as fallbacks", () => {
		expect(preferTwelveHourCacheRoutes([azure, bedrock, openai], responsesRequest(), "openai/gpt-5.6-sol"))
			.toEqual([openai, azure, bedrock]);
	});

	it("keeps the order for requests without 12 hours, a client provider order, or no capable route", () => {
		const plain: IRChatRequest = { model: "openai/gpt-5.6-sol", messages: [] };
		expect(preferTwelveHourCacheRoutes([azure, openai], plain, "openai/gpt-5.6-sol")).toEqual([azure, openai]);
		expect(preferTwelveHourCacheRoutes([azure, openai], responsesRequest(), "openai/gpt-5.6-sol", { explicitOrder: true }))
			.toEqual([azure, openai]);
		expect(preferTwelveHourCacheRoutes([azure, bedrock], responsesRequest(), "openai/gpt-5.6-sol")).toEqual([azure, bedrock]);
	});
});
