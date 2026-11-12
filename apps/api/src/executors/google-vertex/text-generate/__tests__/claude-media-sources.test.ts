import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import { decodeProtocol } from "@protocols/index";
import { executor as vertexExecutor } from "../index";
import { executor as bedrockExecutor } from "@executors/amazon-bedrock/text-generate";
import { installFetchMock } from "../../../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../../../tests/helpers/runtime";
import { opusMessage, opusStream } from "../../../../../tests/helpers/opus-55";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
afterEach(() => teardownTestRuntime());

// "On Amazon Bedrock and Google Cloud, only base64-encoded sources are currently available."
// https://platform.claude.com/docs/en/build-with-claude/vision
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
const PDF = new TextEncoder().encode("%PDF-1.4");

function media(bytes: Uint8Array, contentType: string): Response {
	return new Response(bytes, { status: 200, headers: { "content-type": contentType, "content-length": String(bytes.byteLength) } });
}

function chatArgs(providerId: string, providerModelSlug: string, content: any[]): ExecutorExecuteArgs {
	return {
		ir: decodeProtocol("openai.chat.completions", {
			model: "anthropic/claude-opus-5.5",
			messages: [{ role: "user", content }],
			max_tokens: 128,
		}),
		requestId: "req_claude_media", workspaceId: "workspace", providerId,
		endpoint: "chat.completions", protocol: "openai.chat.completions", capability: "text.generate",
		providerModelSlug, capabilityParams: null, byokMeta: [], pricingCard: null, meta: { returnUsage: true },
	} as unknown as ExecutorExecuteArgs;
}

const content = [
	{ type: "text", text: "What is in these?" },
	{ type: "image_url", image_url: { url: "https://cdn.example.com/cat.png" } },
	{ type: "file", file: { file_data: "https://cdn.example.com/report.pdf", filename: "report.pdf" } },
];

const mediaHandlers = [
	{ match: (url: string) => url === "https://cdn.example.com/cat.png", response: () => media(PNG, "image/png") },
	{ match: (url: string) => url === "https://cdn.example.com/report.pdf", response: () => media(PDF, "application/pdf") },
];

const expectedBlocks = [
	{ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw==" } },
	{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0xLjQ=" }, title: "report.pdf" },
];

describe("Claude image and PDF URLs on base64-only platforms", () => {
	it("sends Vertex AI base64 sources for image and PDF URLs", async () => {
		setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "managed-project", GOOGLE_VERTEX_ACCESS_TOKEN: "mock-managed-token" } as any);
		const mock = installFetchMock([...mediaHandlers, { match: (url) => url.includes(":streamRawPredict"), response: () => opusStream() }]);
		try {
			await vertexExecutor(chatArgs("google-vertex", "claude-opus-5-5", content));
			const upstream = mock.calls.find((call) => call.url.includes(":streamRawPredict"));
			expect(upstream?.bodyJson.messages[0].content.slice(1)).toEqual(expectedBlocks);
		} finally {
			mock.restore();
		}
	});

	it("sends Bedrock base64 sources for image and PDF URLs", async () => {
		setupRuntimeFromEnv({ AMAZON_BEDROCK_API_KEY: "mock-managed-key", AMAZON_BEDROCK_REGION: "us-east-1" } as any);
		const mock = installFetchMock([...mediaHandlers, { match: (url) => url.endsWith("/anthropic/v1/messages"), response: () => Response.json(opusMessage) }]);
		try {
			await bedrockExecutor(chatArgs("amazon-bedrock", "anthropic.claude-opus-5-5", content));
			const upstream = mock.calls.find((call) => call.url.endsWith("/anthropic/v1/messages"));
			expect(upstream?.bodyJson.messages[0].content.slice(1)).toEqual(expectedBlocks);
		} finally {
			mock.restore();
		}
	});

	it("answers a Files API document with a 400 on Vertex AI instead of sending it", async () => {
		setupRuntimeFromEnv({ GOOGLE_VERTEX_PROJECT: "managed-project", GOOGLE_VERTEX_ACCESS_TOKEN: "mock-managed-token" } as any);
		const mock = installFetchMock([{ match: (url) => url.includes(":streamRawPredict"), response: () => opusStream() }]);
		try {
			const result = await vertexExecutor(chatArgs("google-vertex", "claude-opus-5-5", [
				{ type: "text", text: "Summarise" },
				{ type: "file", file: { file_id: "file_011abc" } },
			]));
			expect(mock.calls).toHaveLength(0);
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.json()).toMatchObject({ error: "unsupported_parameter" });
		} finally {
			mock.restore();
		}
	});
});
