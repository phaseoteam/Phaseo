import { describe, expect, it } from "vitest";
import {
	detectProtocol,
	detectTextProtocol,
	protocolSupportsFeature,
} from "./detect";

describe("detectTextProtocol", () => {
	it("detects openai chat protocol for chat completions endpoint", () => {
		expect(
			detectTextProtocol("chat.completions", "/v1/chat/completions"),
		).toBe("openai.chat.completions");
	});

	it("detects responses protocol for responses endpoint", () => {
		expect(detectTextProtocol("responses", "/v1/responses")).toBe(
			"openai.responses",
		);
	});

	it("prefers anthropic protocol for messages path", () => {
		expect(detectTextProtocol("messages", "/v1/messages")).toBe(
			"anthropic.messages",
		);
	});

	it("throws when invoked with non-text endpoint", () => {
		expect(() =>
			detectTextProtocol("embeddings", "/v1/embeddings"),
		).toThrow("unsupported endpoint");
	});
});

describe("detectProtocol", () => {
	it("keeps existing endpoint-based behavior for non-text protocols", () => {
		expect(detectProtocol("embeddings", "/v1/embeddings")).toBe(
			"openai.embeddings",
		);
		expect(detectProtocol("moderations", "/v1/moderations")).toBe(
			"openai.moderations",
		);
		expect(detectProtocol("rerank", "/v1/rerank")).toBe(
			"openai.rerank",
		);
		expect(detectProtocol("systemone", "/v1/systemone")).toBe(
			"typesafe.systemone",
		);
	});

	it("keeps structured decision protocol capabilities explicit", () => {
		expect(protocolSupportsFeature("typesafe.systemone", "streaming")).toBe(false);
		expect(protocolSupportsFeature("typesafe.systemone", "tools")).toBe(false);
		expect(protocolSupportsFeature("typesafe.systemone", "multimodal")).toBe(false);
		expect(protocolSupportsFeature("typesafe.systemone", "reasoning")).toBe(false);
	});
});
