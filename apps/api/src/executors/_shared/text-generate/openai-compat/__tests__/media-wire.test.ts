import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
import type { IRContentPart } from "@core/ir";
import { executeOpenAIWire } from "../index";
import { installFetchMock, jsonResponse } from "../../../../../../tests/helpers/mock-fetch";
import { setupTestRuntime, teardownTestRuntime } from "../../../../../../tests/helpers/runtime";

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

const MP3 = Uint8Array.from([0x49, 0x44, 0x33]);

function args(providerId: string, content: IRContentPart[]): ExecutorExecuteArgs {
	return {
		ir: { model: "test/model", stream: false, messages: [{ role: "user", content }] },
		requestId: "req_media_wire",
		workspaceId: "team_test",
		providerId,
		endpoint: "chat.completions",
		protocol: "openai.chat.completions",
		capability: "text.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: { rules: [] } as any,
		meta: {},
	} as unknown as ExecutorExecuteArgs;
}

const completion = () => jsonResponse({
	id: "chatcmpl_media",
	object: "chat.completion",
	created: 1735689600,
	model: "test/model",
	choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
	usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
});

describe("media on the OpenAI-compatible wire", () => {
	it("sends Alibaba Cloud video as the video_url part", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.alibaba.example/compatible-mode/v1/chat/completions",
			response: completion,
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		try {
			await executeOpenAIWire(args("alibaba-cloud", [
				{ type: "text", text: "Describe this video." },
				{ type: "video", source: "url", url: "https://example.com/clip.mp4" },
			]), { forceChat: true });
		} finally {
			mock.restore();
		}
		expect(body.messages[0].content[1]).toEqual({ type: "video_url", video_url: { url: "https://example.com/clip.mp4" } });
	});

	it("downloads audio given by URL and sends it as base64 input_audio", async () => {
		let body: any;
		const mock = installFetchMock([
			{
				match: (url) => url === "https://cdn.example.com/note.mp3",
				response: () => new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg", "content-length": "3" } }),
			},
			{
				match: (url) => url === "https://api.deepinfra.example/v1/openai/chat/completions",
				response: completion,
				onRequest: (call) => { body = call.bodyJson; },
			},
		]);
		try {
			await executeOpenAIWire(args("deepinfra", [
				{ type: "text", text: "Transcribe." },
				{ type: "audio", source: "url", data: "https://cdn.example.com/note.mp3" },
			]));
		} finally {
			mock.restore();
		}
		expect(body.messages[0].content[1]).toEqual({ type: "input_audio", input_audio: { data: "SUQz", format: "mp3" } });
	});

	it("keeps detail low on a base64 image", async () => {
		let body: any;
		const mock = installFetchMock([{
			match: (url) => url === "https://api.deepinfra.example/v1/openai/chat/completions",
			response: completion,
			onRequest: (call) => { body = call.bodyJson; },
		}]);
		try {
			await executeOpenAIWire(args("deepinfra", [
				{ type: "image", source: "data", data: "aGVsbG8=", mimeType: "image/png", detail: "low" },
			]));
		} finally {
			mock.restore();
		}
		expect(body.messages[0].content[0]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=", detail: "low" } });
	});
});
