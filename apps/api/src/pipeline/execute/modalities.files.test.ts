import { describe, expect, it } from "vitest";
import { filterCandidatesByModalities } from "./modalities";
import type { IRChatRequest, IRContentPart } from "@core/ir";
import type { ProviderCandidate } from "../before/types";

function candidate(providerId: string, inputModalities: string[] | null, providerModelSlug: string | null = null): ProviderCandidate {
	return {
		providerId,
		providerStatus: "active",
		adapter: undefined as any,
		baseWeight: 1,
		byokMeta: [],
		pricingCard: null,
		providerModelSlug,
		inputModalities,
		outputModalities: ["text"],
		maxInputTokens: null,
		maxOutputTokens: null,
	} as ProviderCandidate;
}

function userRequest(model: string, content: IRContentPart[]): IRChatRequest {
	return { model, stream: false, messages: [{ role: "user", content }] };
}

const pdf: IRContentPart = { type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf" };

const ids = (candidates: ProviderCandidate[]) => candidates.map((entry) => entry.providerId);

describe("file and document routing", () => {
	it("routes a PDF only to routes that take files", () => {
		const filtered = filterCandidatesByModalities([
			candidate("openai", ["text", "image"]),
			candidate("deepseek", ["text"]),
			candidate("cerebras", ["text", "image"]),
			candidate("reka", ["text", "image", "document"]),
			candidate("google-ai-studio", ["text", "image", "audio", "video"]),
		], userRequest("x/model", [{ type: "text", text: "Summarise" }, pdf]));
		// cerebras takes images but documents no file part; reka's route declares documents.
		expect(ids(filtered)).toEqual(["openai", "reka", "google-ai-studio"]);
	});

	it("treats an Anthropic document block the IR could not translate as a file", () => {
		const filtered = filterCandidatesByModalities([
			candidate("anthropic", ["text", "image"]),
			candidate("together", ["text", "image"]),
		], userRequest("anthropic/claude-sonnet-4.6", [{ type: "provider_block", block: { type: "document", source: { type: "content", content: [] } } }]));
		expect(ids(filtered)).toEqual(["anthropic"]);
	});

	it("takes files on Vertex AI and Bedrock only for Claude and Gemini models", () => {
		const request = userRequest("meta/llama-4-maverick", [pdf]);
		expect(filterCandidatesByModalities([
			candidate("google-vertex", ["text", "image"], "llama-4-maverick-17b-128e-instruct-maas"),
			candidate("amazon-bedrock", ["text", "image"], "meta.llama4-maverick-17b-instruct-v1:0"),
		], request)).toEqual([]);
		expect(ids(filterCandidatesByModalities([
			candidate("google-vertex", ["text", "image"], "claude-sonnet-4-6"),
			candidate("amazon-bedrock", ["text", "image"], "anthropic.claude-sonnet-4-6"),
		], userRequest("anthropic/claude-sonnet-4.6", [pdf])))).toEqual(["google-vertex", "amazon-bedrock"]);
	});

	it("requires image input for images inside tool results", () => {
		const filtered = filterCandidatesByModalities([
			candidate("openai", ["text", "image"]),
			candidate("deepseek", ["text"]),
		], {
			model: "x/model",
			stream: false,
			messages: [{
				role: "tool",
				toolResults: [{ toolCallId: "call_1", content: "", parts: [{ type: "image", source: "url", data: "https://example.com/chart.png" }] }],
			}],
		});
		expect(ids(filtered)).toEqual(["openai"]);
	});

	it("sends uploaded file ids only to providers that can resolve them", () => {
		const request = userRequest("x/model", [{ type: "file", source: "id", data: "file-abc123" }]);
		const filtered = filterCandidatesByModalities([
			candidate("openai", ["text", "image"]),
			candidate("google-ai-studio", ["text", "image"]),
			candidate("google-vertex", ["text", "image"], "claude-sonnet-4-6"),
			candidate("anthropic", ["text", "image"]),
			candidate("deepinfra", ["text", "image"]),
		], request);
		expect(ids(filtered)).toEqual(["openai", "anthropic"]);
	});

	it("keeps Gemini Files API names on Google AI Studio", () => {
		const request = userRequest("google/gemini-3-pro", [{ type: "file", source: "id", data: "files/abc123", mimeType: "application/pdf" }]);
		expect(ids(filterCandidatesByModalities([
			candidate("google-ai-studio", ["text", "image"]),
			candidate("google-vertex", ["text", "image"], "gemini-3-pro"),
		], request))).toEqual(["google-ai-studio"]);
	});

	it("sends Messages Files API images only to Claude API, Claude Platform on AWS and Foundry routes", () => {
		const request = userRequest("anthropic/claude-sonnet-4.6", [{ type: "image", source: "id", data: "file_011abc" }]);
		const filtered = filterCandidatesByModalities([
			candidate("anthropic", ["text", "image"]),
			candidate("anthropic-aws", ["text", "image"]),
			candidate("google-vertex", ["text", "image"], "claude-sonnet-4-6"),
			candidate("amazon-bedrock", ["text", "image"], "anthropic.claude-sonnet-4-6"),
			candidate("openai", ["text", "image"]),
		], request, { protocol: "anthropic.messages" });
		expect(ids(filtered)).toEqual(["anthropic", "anthropic-aws"]);
	});

	it("leaves text-only and image requests as before", () => {
		const request = userRequest("x/model", [{ type: "text", text: "Hi" }, { type: "image", source: "url", data: "https://example.com/a.png" }]);
		expect(ids(filterCandidatesByModalities([
			candidate("cerebras", ["text", "image"]),
			candidate("deepseek", ["text"]),
		], request))).toEqual(["cerebras"]);
	});
});
