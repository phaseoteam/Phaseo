import { describe, expect, it } from "vitest";
import { decodeAnthropicMessagesRequest } from "@protocols/anthropic-messages/decode";
import { decodeOpenAIChatRequest } from "@protocols/openai-chat/decode";
import { irToAnthropicMessages } from "@executors/anthropic/text-generate";
import { normalizeIRForProvider } from "./normalize";
import { droppedParamsForClient, recordDroppedParams, type DroppedParam } from "./unsupportedParams";

const oneHour = { type: "ephemeral", ttl: "1h" };

// A Messages request with a 1-hour breakpoint on every block type that takes one.
function messagesRequest(model: string): any {
	return {
		model,
		max_tokens: 256,
		cache_control: oneHour,
		system: [{ type: "text", text: "You review pull requests.", cache_control: oneHour }],
		tools: [{ name: "read_file", description: "Read a file", input_schema: { type: "object" }, cache_control: oneHour }],
		messages: [
			{ role: "user", content: [{ type: "text", text: "Review src/a.ts", cache_control: oneHour }] },
			{ role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "src/a.ts" } }] },
			{ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "export const a = 1;", cache_control: oneHour }] },
		],
	};
}

function marks(request: any): any[] {
	const found: any[] = [];
	const walk = (value: any) => {
		if (!value || typeof value !== "object") return;
		if (value.cache_control) found.push(value.cache_control);
		for (const child of Object.values(value)) walk(child);
	};
	walk({ system: request.system, tools: request.tools, messages: request.messages });
	return found;
}

function upstream(providerId: string, gatewayModel: string, providerModel: string, request = messagesRequest(gatewayModel)) {
	const dropped: DroppedParam[] = [];
	const ir = normalizeIRForProvider(decodeAnthropicMessagesRequest(request), providerId, "anthropic.messages", {
		modelForReasoning: providerModel,
		onDroppedParams: (entries) => dropped.push(...entries),
	});
	return { request: irToAnthropicMessages(ir, null, providerModel, { providerId }), dropped };
}

describe("1-hour cache TTL on Claude models that cache for 5 minutes only", () => {
	it.each([
		["amazon-bedrock", "anthropic.claude-3-7-sonnet-20250219-v1:0"],
		["google-vertex", "claude-3-7-sonnet@20250219"],
		["google-vertex-eu", "claude-3-5-sonnet-v2@20241022"],
	])("keeps every breakpoint without a ttl on %s %s and reports the drop", (providerId, providerModel) => {
		const { request, dropped } = upstream(providerId, "anthropic/claude-3.7-sonnet", providerModel);
		expect(marks(request).length).toBeGreaterThanOrEqual(4);
		for (const mark of marks(request)) expect(mark).toEqual({ type: "ephemeral" });
		expect(dropped).toEqual([
			{ param: "cache_control.ttl", reason: "value_not_supported", source: "provider_api", clientSent: true },
		]);
	});

	it("reports the drop to the client", () => {
		const { dropped } = upstream("amazon-bedrock", "anthropic/claude-3.7-sonnet", "anthropic.claude-3-7-sonnet-20250219-v1:0");
		const ctx: any = { endpoint: "messages", requestedParams: ["cache_control"] };
		recordDroppedParams(ctx, "amazon-bedrock", dropped);
		expect(droppedParamsForClient(ctx)).toEqual([
			{ param: "cache_control.ttl", reason: "value_not_supported", source: "provider_api", provider: "amazon-bedrock" },
		]);
	});

	it("removes an explicit 5m ttl without reporting it", () => {
		const fiveMinutes = { type: "ephemeral", ttl: "5m" };
		const request = {
			model: "anthropic/claude-3.7-sonnet",
			max_tokens: 256,
			system: [{ type: "text", text: "You review pull requests.", cache_control: fiveMinutes }],
			messages: [{ role: "user", content: [{ type: "text", text: "Review src/a.ts" }] }],
		};
		const { request: sent, dropped } = upstream("amazon-bedrock", "anthropic/claude-3.7-sonnet", "anthropic.claude-3-7-sonnet-20250219-v1:0", request);
		expect(marks(sent)).toEqual([{ type: "ephemeral" }]);
		expect(dropped).toEqual([]);
	});

	it("removes a Chat content part ttl the same way", () => {
		const dropped: DroppedParam[] = [];
		const chat = decodeOpenAIChatRequest({
			model: "anthropic/claude-3.7-sonnet",
			messages: [
				{ role: "system", content: [{ type: "text", text: "You review pull requests.", cache_control: oneHour }] },
				{ role: "user", content: "Review src/a.ts" },
			],
		} as any);
		const ir = normalizeIRForProvider(chat, "google-vertex", "openai.chat.completions", {
			modelForReasoning: "claude-3-7-sonnet@20250219",
			onDroppedParams: (entries) => dropped.push(...entries),
		});
		expect(marks(irToAnthropicMessages(ir, null, "claude-3-7-sonnet@20250219", { providerId: "google-vertex" }))).toEqual([{ type: "ephemeral" }]);
		expect(dropped.map((entry) => entry.param)).toEqual(["cache_control.ttl"]);
	});

	it.each([
		["amazon-bedrock", "anthropic/claude-sonnet-4.6", "anthropic.claude-sonnet-4-6"],
		["google-vertex", "anthropic/claude-sonnet-4.6", "claude-sonnet-4-6"],
		["anthropic", "anthropic/claude-3.7-sonnet", "claude-3-7-sonnet-20250219"],
		["anthropic-aws", "anthropic/claude-3.7-sonnet", "claude-3-7-sonnet-20250219"],
	])("keeps the 1-hour ttl on %s %s", (providerId, gatewayModel, providerModel) => {
		const { request, dropped } = upstream(providerId, gatewayModel, providerModel);
		expect(marks(request).length).toBeGreaterThanOrEqual(4);
		for (const mark of marks(request)) expect(mark).toEqual(oneHour);
		expect(dropped).toEqual([]);
	});
});
