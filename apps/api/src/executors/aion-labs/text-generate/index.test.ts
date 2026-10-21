import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IRChatRequest } from "@core/ir";
import { openAICompatHeaders, openAICompatUrl, resolveOpenAICompatRoute } from "@providers/openai-compatible/config";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { decodeOpenAIResponsesRequest } from "../../../protocols/openai-responses/decode";
import { preprocess } from "./index";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

describe("Aion Labs text transport contract", () => {
	it.each(["aion-labs", "aionlabs"])("uses the official chat endpoint and bearer auth for %s", (providerId) => {
		expect(resolveOpenAICompatRoute(providerId, "aion-labs/aion-3.0")).toBe("chat");
		expect(openAICompatUrl(providerId, "/chat/completions")).toBe("https://api.aionlabs.example/v1/chat/completions");
		expect(openAICompatHeaders(providerId, "secret").Authorization).toBe("Bearer secret");
	});

	it("passes the IR through preprocessing unchanged; routing enforces param support", () => {
		const ir: IRChatRequest = {
			model: "aion-labs/aion-3.0",
			stream: true,
			messages: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
			maxTokens: 1024,
			temperature: 0.7,
			topP: 0.9,
			stop: ["END"],
			metadata: { trace: "aion-contract" },
			responseFormat: { type: "json_object" },
			tools: [{ name: "lookup", parameters: { type: "object" } }],
		};
		const capabilityParams = Object.fromEntries([
			"max_tokens", "temperature", "stop", "stream", "tools", "reasoning_split", "metadata",
		].map((key) => [key, {}]));

		// Production routing hands executors the keyed record, not a wrapped list.
		const result = preprocess(ir, { capabilityParams } as any);
		expect(result).toBe(ir);
		expect(result.maxTokens).toBe(1024);
		expect(result.stop).toEqual(["END"]);
		expect(result.tools).toHaveLength(1);
		expect(result.metadata).toEqual({ trace: "aion-contract" });
		expect(result.topP).toBe(0.9);
	});

	it("decodes Aion's top-level Responses reasoning_effort extension", () => {
		const ir = decodeOpenAIResponsesRequest({
			model: "aion-labs/aion-2.0",
			input: "Hello",
			reasoning_effort: "high",
		} as any);

		expect(ir.reasoning).toEqual({ effort: "high" });
	});
});
