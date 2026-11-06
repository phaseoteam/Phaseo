import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { exec } from "../endpoints/audio-speech";

beforeAll(() => setupTestRuntime());
afterAll(() => teardownTestRuntime());

function args(body: Record<string, unknown>) {
	return {
		endpoint: "audio.speech",
		model: "x-ai/grok-tts",
		body: { model: "x-ai/grok-tts", input: "Hello", voice: "eve", ...body },
		meta: { requestId: "req_xai_tts", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" },
		workspaceId: "team_test",
		providerId: "x-ai",
		byokMeta: [],
		pricingCard: { provider: "x-ai", model: "grok-tts", endpoint: "audio.speech", currency: "USD", rules: [] },
		providerModelSlug: "grok-tts",
		stream: false,
	} as any;
}

describe("xAI audio.speech endpoint", () => {
	it("decodes the REST JSON envelope into an audio response", async () => {
		let requestBody: any;
		const audio = Buffer.from([1, 2, 3, 4]).toString("base64");
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/tts"),
			response: jsonResponse({ audio, content_type: "audio/wav", duration: 1.25 }),
			onRequest: (call) => { requestBody = call.bodyJson; },
		}]);

		const result = await exec(args({ response_format: "wav", speed: 1.2 }));
		mock.restore();

		expect(requestBody).toMatchObject({
			text: "Hello",
			voice_id: "eve",
			language: "auto",
			speed: 1.2,
			output_format: { codec: "wav" },
		});
		expect(result.upstream.headers.get("content-type")).toBe("audio/wav");
		expect([...new Uint8Array(await result.upstream.arrayBuffer())]).toEqual([1, 2, 3, 4]);
		expect(result.normalized?.audio?.data).toBe(audio);
		expect(result.normalized?.usage?.output_seconds).toBe(1.25);
	});

	it("rejects instructions, which xAI has no field for", async () => {
		const mock = installFetchMock([]);
		const result = await exec(args({ instructions: "Whisper" }));
		mock.restore();
		expect(result.upstream.status).toBe(400);
		expect((await result.upstream.json() as any).error.param).toBe("instructions");
	});

	it("sends the caller's language from config.xai", async () => {
		let requestBody: any;
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/tts"),
			response: jsonResponse({ audio: Buffer.from([1]).toString("base64"), content_type: "audio/mpeg", duration: 1 }),
			onRequest: (call) => { requestBody = call.bodyJson; },
		}]);

		const result = await exec(args({ config: { xai: { language: "pt-BR" } } }));
		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect(requestBody.language).toBe("pt-BR");
		expect(requestBody).not.toHaveProperty("speed");
	});

	it.each([0.5, 1.6])("rejects speed %s outside xAI's 0.7 to 1.5", async (speed) => {
		const result = await exec(args({ speed }));
		expect(result.upstream.status).toBe(400);
		expect((await result.upstream.json() as any).error.param).toBe("speed");
	});

	it("rejects codecs outside xAI's documented set", async () => {
		const result = await exec(args({ response_format: "flac" }));
		expect(result.upstream.status).toBe(400);
		expect((await result.upstream.json() as any).error.param).toBe("response_format");
	});

	it("preserves successful binary audio responses", async () => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/tts"),
			response: new Response(new Uint8Array([5, 6, 7]), {
				status: 200,
				headers: { "Content-Type": "audio/mpeg" },
			}),
		}]);

		const result = await exec(args({ response_format: "mp3" }));
		mock.restore();

		expect(result.upstream.status).toBe(200);
		expect([...new Uint8Array(await result.upstream.arrayBuffer())]).toEqual([5, 6, 7]);
	});

	it.each([
		["null JSON", null],
		["invalid base64", { audio: "not base64!" }],
	])("returns a protocol error for %s", async (_label, payload) => {
		const mock = installFetchMock([{
			match: (url) => url.endsWith("/v1/tts"),
			response: jsonResponse(payload),
		}]);

		const result = await exec(args({ response_format: "mp3" }));
		mock.restore();

		expect(result.upstream.status).toBe(502);
	});
});
