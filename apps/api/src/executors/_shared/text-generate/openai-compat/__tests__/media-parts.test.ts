import { describe, expect, it } from "vitest";
import type { IRChatRequest, IRContentPart } from "@core/ir";
import { irToOpenAIChat } from "../transform-chat";
import { irToOpenAIResponses } from "../transform";

function request(content: IRContentPart[]): IRChatRequest {
	return { model: "test-model", stream: false, messages: [{ role: "user", content }] };
}

const video: IRContentPart = { type: "video", source: "url", url: "https://example.com/clip.mp4" };

describe("video parts", () => {
	it.each(["novitaai", "venice", "z-ai", "friendli", "io-net", "alibaba-cloud", "sambanova"])(
		"sends Chat video to %s as the documented video_url part",
		(providerId) => {
			const wire = irToOpenAIChat(request([{ type: "text", text: "Describe" }, video]), "m", providerId);
			expect(wire.messages[0].content[1]).toEqual({ type: "video_url", video_url: { url: "https://example.com/clip.mp4" } });
		},
	);

	it("sends Responses video as input_video with a string video_url", () => {
		const wire = irToOpenAIResponses(request([{ type: "text", text: "Describe" }, video]), "m", "sambanova");
		expect(wire.input[0].content[1]).toEqual({ type: "input_video", video_url: "https://example.com/clip.mp4" });
	});

	it.each([
		["deepinfra", { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } }],
		["baseten", { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } }],
		["reka", { type: "video_url", video_url: "https://example.com/clip.mp4" }],
		["byteplus", { type: "input_video", video_url: "https://example.com/clip.mp4" }],
	])("keeps %s's video shape", (providerId, expected) => {
		const wire = irToOpenAIChat(request([{ type: "text", text: "Describe" }, video]), "m", providerId);
		expect(wire.messages[0].content[1]).toEqual(expected);
	});
});

describe("image detail", () => {
	const base64Low: IRContentPart = { type: "image", source: "data", data: "aGVsbG8=", mimeType: "image/png", detail: "low" };

	it("keeps detail on base64 images on Chat Completions", () => {
		const wire = irToOpenAIChat(request([base64Low]), "gpt-4.1", "openai");
		expect(wire.messages[0].content[0]).toEqual({
			type: "image_url",
			image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "low" },
		});
	});

	it("forwards original where the provider documents it and sends high elsewhere", () => {
		const original: IRContentPart = { type: "image", source: "url", data: "https://example.com/a.png", detail: "original" };
		expect(irToOpenAIChat(request([original]), "gpt-5.5", "openai").messages[0].content[0].image_url.detail).toBe("original");
		expect(irToOpenAIResponses(request([original]), "gpt-5.5", "openai").input[0].content[0].detail).toBe("original");
		expect(irToOpenAIChat(request([original]), "m", "deepinfra").messages[0].content[0].image_url.detail).toBe("high");
		expect(irToOpenAIResponses(request([original]), "m", "groq").input[0].content[0].detail).toBe("high");
	});

	it("sends a file_id image as input_image file_id on Responses and refuses it on Chat", () => {
		const byId: IRContentPart = { type: "image", source: "id", data: "file-img123", detail: "low" };
		expect(irToOpenAIResponses(request([byId]), "gpt-5.5", "openai").input[0].content[0]).toEqual({
			type: "input_image",
			file_id: "file-img123",
			detail: "low",
		});
		expect(() => irToOpenAIChat(request([byId]), "m", "together")).toThrow(expect.objectContaining({ code: "unsupported_parameter" }));
	});
});

describe("Mistral documents and audio", () => {
	it("sends files as document_url and Mistral file ids as file chunks", () => {
		const wire = irToOpenAIChat(request([
			{ type: "file", source: "data", data: "JVBERi0x", mimeType: "application/pdf", filename: "a.pdf" },
			{ type: "file", source: "url", data: "https://example.com/b.pdf" },
			{ type: "file", source: "id", data: "4f7c2a3e-0b1d-4c5e-9f8a-1b2c3d4e5f60" },
		]), "mistral-medium-latest", "mistral");
		expect(wire.messages[0].content).toEqual([
			{ type: "document_url", document_url: "data:application/pdf;base64,JVBERi0x", document_name: "a.pdf" },
			{ type: "document_url", document_url: "https://example.com/b.pdf" },
			{ type: "file", file_id: "4f7c2a3e-0b1d-4c5e-9f8a-1b2c3d4e5f60" },
		]);
	});

	it("refuses another provider's file id", () => {
		expect(() => irToOpenAIChat(request([{ type: "file", source: "id", data: "file-abc" }]), "m", "mistral"))
			.toThrow(expect.objectContaining({ code: "unsupported_parameter" }));
	});

	it("sends input_audio as the base64 string Mistral documents", () => {
		const wire = irToOpenAIChat(request([{ type: "audio", source: "data", data: "UklGRg==", format: "wav" }]), "voxtral-small-latest", "mistral");
		expect(wire.messages[0].content).toEqual([{ type: "input_audio", input_audio: "UklGRg==" }]);
	});
});
