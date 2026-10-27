import { describe, expect, it } from "vitest";
import { filterCandidatesByModalities, routeUploadedFileIds } from "./modalities";
import type { IRChatRequest, IRContentPart } from "@core/ir";
import type { ProviderCandidate } from "../before/types";

function candidate(providerId: string, inputModalities: string[] | null, providerModelSlug: string | null = null, byokMeta: any[] = []): ProviderCandidate {
	return {
		providerId,
		providerStatus: "active",
		adapter: undefined as any,
		baseWeight: 1,
		byokMeta,
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

	it("sends an Anthropic document block the IR could not translate only to routes that keep Claude's block", () => {
		const document: IRContentPart = {
			type: "provider_block",
			block: { type: "document", source: { type: "content", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "aW1n" } }] } },
		};
		const filtered = filterCandidatesByModalities([
			candidate("anthropic", ["text", "image"]),
			candidate("anthropic-aws", ["text", "image"]),
			candidate("azure", ["text", "image"], "claude-sonnet-4-6"),
			candidate("google-vertex", ["text", "image"], "claude-sonnet-4-6"),
			candidate("amazon-bedrock", ["text", "image"], "anthropic.claude-sonnet-4-6"),
			candidate("google-ai-studio", ["text", "image"]),
			candidate("openai", ["text", "image"]),
			candidate("deepinfra", ["text", "image"]),
			candidate("reka", ["text", "image", "document"]),
			candidate("together", ["text", "image"]),
		], userRequest("anthropic/claude-sonnet-4.6", [document]));
		expect(ids(filtered)).toEqual(["anthropic", "anthropic-aws", "azure", "google-vertex", "amazon-bedrock"]);
	});

	it("keeps an untranslatable document off a Foundry route that serves a non-Claude model", () => {
		const request = userRequest("openai/gpt-5.5", [{ type: "provider_block", block: { type: "document", source: { type: "content", content: [] } } }]);
		expect(filterCandidatesByModalities([
			candidate("azure", ["text", "image"], "gpt-5.5"),
			candidate("openai", ["text", "image"]),
		], request)).toEqual([]);
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

	it("sends an OpenAI file id only to OpenAI-format Files APIs", () => {
		const request = userRequest("x/model", [{ type: "file", source: "id", data: "file-abc123" }]);
		const filtered = filterCandidatesByModalities([
			candidate("openai", ["text", "image"]),
			candidate("openai-eu", ["text", "image"]),
			candidate("azure", ["text", "image"], "gpt-5.5"),
			candidate("x-ai", ["text", "image"]),
			candidate("google-ai-studio", ["text", "image"]),
			candidate("google-vertex", ["text", "image"], "claude-sonnet-4-6"),
			candidate("anthropic", ["text", "image"]),
			candidate("deepinfra", ["text", "image"]),
		], request);
		expect(ids(filtered)).toEqual(["openai", "openai-eu", "azure"]);
	});

	it("tells Anthropic and xAI file ids apart by their documented formats", () => {
		const routes = [
			candidate("openai", ["text", "image"]),
			candidate("anthropic", ["text", "image"]),
			candidate("x-ai", ["text", "image"]),
			candidate("mistral", ["text", "image"]),
		];
		const route = (id: string) => ids(filterCandidatesByModalities(routes, userRequest("x/model", [{ type: "file", source: "id", data: id }])));
		expect(route("file_011CNha8iCJcU1wXNR6q4V8w")).toEqual(["anthropic"]);
		expect(route("file_a128090d-f0c9-4873-bd84-e499777e7417")).toEqual(["x-ai"]);
		expect(route("a128090d-f0c9-4873-bd84-e499777e7417")).toEqual(["mistral"]);
	});

	it("uses the account holding the client's own key when an id's provider has several", () => {
		const request = userRequest("openai/gpt-5.5", [{ type: "file", source: "id", data: "file-abc123" }]);
		const routes = filterCandidatesByModalities([
			candidate("openai", ["text", "image"], null, [{ id: "key_1" }]),
			candidate("openai-eu", ["text", "image"]),
			candidate("azure", ["text", "image"], "gpt-5.5"),
		], request);
		const routed = routeUploadedFileIds(routes, request);
		expect(routed.ok && ids(routed.candidates)).toEqual(["openai", "openai-eu"]);
	});

	it("asks for a provider pin rather than trying accounts that cannot read the id", () => {
		const request = userRequest("openai/gpt-5.5", [{ type: "file", source: "id", data: "file-abc123" }]);
		const routes = filterCandidatesByModalities([
			candidate("openai", ["text", "image"]),
			candidate("azure", ["text", "image"], "gpt-5.5"),
		], request);
		expect(routeUploadedFileIds(routes, request)).toEqual({ ok: false, providers: ["openai", "azure"] });
		// Pinned (only one provider left), the request goes through.
		const pinned = routeUploadedFileIds(routes.filter((entry) => entry.providerId === "openai"), request);
		expect(pinned.ok && ids(pinned.candidates)).toEqual(["openai"]);
	});

	it("needs a provider pin for a file id in no documented format", () => {
		const request = userRequest("x/model", [{ type: "file", source: "id", data: "upload-42" }]);
		const routes = filterCandidatesByModalities([
			candidate("openai", ["text", "image"]),
			candidate("mistral", ["text", "image"]),
			candidate("deepinfra", ["text", "image"]),
		], request);
		expect(ids(routes)).toEqual(["openai", "mistral"]);
		expect(routeUploadedFileIds(routes, request).ok).toBe(false);
		expect(routeUploadedFileIds(routes.slice(1), request).ok).toBe(true);
	});

	it("leaves requests without file ids alone", () => {
		const request = userRequest("x/model", [pdf]);
		const routes = [candidate("openai", ["text", "image"]), candidate("azure", ["text", "image"])];
		expect(routeUploadedFileIds(routes, request)).toEqual({ ok: true, candidates: routes });
	});

	it("routes a Gemini Files API audio upload only to Google AI Studio", () => {
		const request = userRequest("google/gemini-3-pro", [{ type: "file", source: "id", data: "files/abc", mimeType: "audio/mpeg" }]);
		const filtered = filterCandidatesByModalities([
			candidate("google-ai-studio", ["text", "image", "audio", "video"]),
			candidate("google-vertex", ["text", "image", "audio", "video"], "gemini-3-pro"),
			candidate("openai", ["text", "image", "audio"]),
			candidate("deepinfra", ["text", "audio"]),
		], request);
		expect(ids(filtered)).toEqual(["google-ai-studio"]);
		// The model must still take audio.
		expect(filterCandidatesByModalities([candidate("google-ai-studio", ["text", "image"])], request)).toEqual([]);
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
		// Two Claude accounts remain, so the client must pick one.
		expect(routeUploadedFileIds(filtered, request).ok).toBe(false);
	});

	it("leaves text-only and image requests as before", () => {
		const request = userRequest("x/model", [{ type: "text", text: "Hi" }, { type: "image", source: "url", data: "https://example.com/a.png" }]);
		expect(ids(filterCandidatesByModalities([
			candidate("cerebras", ["text", "image"]),
			candidate("deepseek", ["text"]),
		], request))).toEqual(["cerebras"]);
	});
});
