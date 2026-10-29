import { describe, expect, it } from "vitest";
import type { IRChatRequest, IRContentPart } from "@core/ir";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { inlineClaudeMediaForBase64OnlyPlatform } from "../inline-media";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const PDF = new TextEncoder().encode("%PDF-1.4");

function ir(content: IRContentPart[]): IRChatRequest {
	return { model: "anthropic/claude-sonnet-4.6", stream: false, messages: [{ role: "user", content }] };
}

const args = { providerId: "google-vertex", requestId: "req_media" } as const;

function mediaResponse(bytes: Uint8Array, contentType: string): Response {
	return new Response(bytes, { status: 200, headers: { "content-type": contentType, "content-length": String(bytes.byteLength) } });
}

describe("Claude on Vertex AI and Bedrock: base64 sources only", () => {
	it("downloads URL images and documents and inlines them as base64", async () => {
		const mock = installFetchMock([
			{ match: (url) => url === "https://cdn.example.com/cat.png", response: () => mediaResponse(PNG, "image/png") },
			{ match: (url) => url === "https://cdn.example.com/report.pdf", response: () => mediaResponse(PDF, "application/pdf") },
		]);
		try {
			const result = await inlineClaudeMediaForBase64OnlyPlatform(ir([
				{ type: "image", source: "url", data: "https://cdn.example.com/cat.png" },
				{
					type: "file", source: "url", data: "https://cdn.example.com/report.pdf", mimeType: "application/pdf",
					nativeBlock: { type: "document", source: { type: "url", url: "https://cdn.example.com/report.pdf" }, citations: { enabled: true } },
				},
			]), args);
			if (result.ok === false) throw new Error("expected inlined request");
			expect(result.ir.messages[0]).toEqual({
				role: "user",
				content: [
					{ type: "image", source: "data", data: "iVBORw==", mimeType: "image/png" },
					{
						type: "file", source: "data", data: "JVBERi0xLjQ=", mimeType: "application/pdf",
						nativeBlock: { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0xLjQ=" }, citations: { enabled: true } },
					},
				],
			});
		} finally {
			mock.restore();
		}
	});

	it("inlines images inside tool results too", async () => {
		const mock = installFetchMock([{ match: () => true, response: () => mediaResponse(PNG, "image/png") }]);
		try {
			const result = await inlineClaudeMediaForBase64OnlyPlatform({
				model: "m",
				stream: false,
				messages: [{
					role: "tool",
					toolResults: [{ toolCallId: "call_1", content: "", parts: [{ type: "image", source: "url", data: "https://cdn.example.com/chart.png" }] }],
				}],
			}, args);
			if (result.ok === false) throw new Error("expected inlined request");
			expect((result.ir.messages[0] as any).toolResults[0].parts[0]).toMatchObject({ source: "data", mimeType: "image/png" });
		} finally {
			mock.restore();
		}
	});

	it.each([
		["a Files API image", { type: "image", source: "id", data: "file_011abc" }, "unsupported_parameter", /cannot read Files API uploads/],
		["a Files API document", { type: "file", source: "id", data: "file_011abc" }, "unsupported_parameter", /cannot read Files API uploads/],
		["an SVG image", { type: "image", source: "url", data: "https://cdn.example.com/logo.svg" }, "unsupported_image_type", /image\/svg\+xml/],
	] as Array<[string, IRContentPart, string, RegExp]>)("rejects %s with a clear 400", async (_name, part, code, message) => {
		const mock = installFetchMock([{ match: () => true, response: () => mediaResponse(PNG, "image/svg+xml") }]);
		try {
			const result = await inlineClaudeMediaForBase64OnlyPlatform(ir([part]), args);
			if (result.ok) throw new Error("expected a 400");
			expect(result.result.upstream.status).toBe(400);
			expect(result.result).toMatchObject({ terminal: true, localClientError: true });
			const body = await result.result.upstream.json();
			expect(body.error).toBe(code);
			expect(body.message).toMatch(message);
		} finally {
			mock.restore();
		}
	});

	it("rejects an image over Claude's 5 MB limit", async () => {
		const mock = installFetchMock([{
			match: () => true,
			response: () => new Response("x", { status: 200, headers: { "content-type": "image/png", "content-length": String(6 * 1024 * 1024) } }),
		}]);
		try {
			const result = await inlineClaudeMediaForBase64OnlyPlatform(ir([{ type: "image", source: "url", data: "https://cdn.example.com/big.png" }]), args);
			if (result.ok) throw new Error("expected a 400");
			expect((await result.result.upstream.json()).error).toBe("image_too_large");
		} finally {
			mock.restore();
		}
	});
});
