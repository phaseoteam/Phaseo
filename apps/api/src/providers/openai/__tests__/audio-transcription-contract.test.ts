import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestRuntime, teardownTestRuntime } from "../../../../tests/helpers/runtime";
import { installFetchMock, jsonResponse } from "../../../../tests/helpers/mock-fetch";
import { sseResponse } from "../../../../tests/helpers/sse";
import { exec } from "../endpoints/audio-transcription";

const META = { requestId: "req_transcription_contract", apiKeyId: "key", apiKeyRef: "kid", apiKeyKid: "kid" };

beforeAll(setupTestRuntime);
afterAll(teardownTestRuntime);

function args(body: Record<string, any>, providerId = "openai") {
	return {
		endpoint: "audio.transcription",
		model: body.model,
		body,
		meta: META,
		workspaceId: "team_test",
		providerId,
		byokMeta: [],
		pricingCard: null,
		providerModelSlug: String(body.model).replace(/^openai\//, ""),
		stream: body.stream === true,
	} as any;
}

describe("OpenAI audio transcription contract", () => {
	it("uses Scaleway's multipart contract and duration usage", async () => {
		let form: FormData | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				if (url !== "https://api.scaleway.example/v1/audio/transcriptions") return false;
				form = init?.body as FormData;
				return true;
			},
			response: jsonResponse({ text: "Bonjour", usage: { type: "duration", seconds: 12.5 } }),
		}]);
		const result = await exec(args({
			model: "whisper-large-v3",
			file: new File(["audio"], "sample.mp3", { type: "audio/mpeg" }),
			language: "fr", prompt: "Phaseo", temperature: 0, response_format: "json", stream: false,
		}, "scaleway"));
		mock.restore();
		expect(form?.get("model")).toBe("whisper-large-v3");
		expect(form?.get("language")).toBe("fr");
		expect(form?.get("prompt")).toBe("Phaseo");
		expect(form?.get("response_format")).toBe("json");
		expect(result.normalized).toMatchObject({ text: "Bonjour", usage: { input_audio_seconds: 12.5 } });
	});

	it.each(["timestamp_granularities", "include", "chunking_strategy"])("rejects Scaleway's unsupported %s field", async (field) => {
		const value = field === "chunking_strategy" ? "auto" : ["word"];
		const result = await exec(args({ model: "whisper-large-v3", file: new File(["audio"], "sample.wav"), [field]: value }, "scaleway"));
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({ error: { param: field } });
	});

	it("forwards gpt-transcribe language and keyword hints", async () => {
		let form: FormData | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				if (!url.includes("/audio/transcriptions")) return false;
				form = init?.body as FormData;
				return true;
			},
			response: jsonResponse({ text: "Bonjour", languages: [{ code: "fr" }] }),
		}]);
		const result = await exec(args({
			model: "openai/gpt-transcribe",
			file: new File(["audio"], "sample.wav", { type: "audio/wav" }),
			languages: ["en", "fr"],
			keywords: ["Phaseo", "AC-42"],
			prompt: "A support call",
			temperature: 0.5,
		}));
		mock.restore();
		expect(form?.getAll("languages[]")).toEqual(["en", "fr"]);
		expect(form?.getAll("keywords[]")).toEqual(["Phaseo", "AC-42"]);
		expect(form?.get("temperature")).toBe("0.5");
		expect(result.normalized?.languages).toEqual([{ code: "fr" }]);
	});

	it("passes native transcription SSE through and finalizes authoritative usage", async () => {
		let form: FormData | undefined;
		const mock = installFetchMock([{
			match: (url, init) => {
				if (!url.includes("/audio/transcriptions")) return false;
				form = init?.body as FormData;
				return true;
			},
			response: sseResponse([
				{ type: "transcript.text.delta", delta: "Bon" },
				{ type: "transcript.text.done", text: "Bonjour", languages: [{ code: "fr" }], usage: { type: "tokens", input_tokens: 5, input_token_details: { text_tokens: 1, audio_tokens: 4 }, output_tokens: 7, total_tokens: 12 } },
			]),
		}]);
		const result = await exec(args({
			model: "gpt-transcribe",
			file: new File(["audio"], "sample.wav", { type: "audio/wav" }),
			stream: true,
		}));
		mock.restore();
		expect(form?.get("stream")).toBe("true");
		expect(result.kind).toBe("stream");
		if (result.kind === "stream") {
			const wire = await new Response(result.stream).text();
			expect(wire).toContain("transcript.text.delta");
			expect(wire).toContain("transcript.text.done");
			const bill = await result.usageFinalizer?.();
			expect(bill?.usage).toMatchObject({ type: "tokens", input_tokens: 5, output_tokens: 7, total_tokens: 12, requests: 1 });
		}
	});

	it("uses the OpenAI EU transcription endpoint", async () => {
		let url = "";
		const mock = installFetchMock([{
			match: (candidate) => candidate === "https://eu.api.openai.com/v1/audio/transcriptions",
			response: jsonResponse({ text: "hello" }),
			onRequest: (call) => { url = call.url; },
		}]);
		const result = await exec(args({ model: "whisper-1", file: new File(["audio"], "sample.wav", { type: "audio/wav" }) }, "openai-eu"));
		mock.restore();
		expect(url).toBe("https://eu.api.openai.com/v1/audio/transcriptions");
		expect(result.upstream.status).toBe(200);
	});

	it("rejects logprobs for gpt-transcribe", async () => {
		const result = await exec(args({
			model: "gpt-transcribe",
			file: new File(["audio"], "sample.wav", { type: "audio/wav" }),
			include: ["logprobs"],
		}));
		expect(result.upstream.status).toBe(400);
		expect(await result.upstream.clone().json()).toMatchObject({ error: { param: "include" } });
	});

	describe("per-provider Whisper upload limits", () => {
		const MB = 1024 * 1024;
		const whisper = (bytes: number) => ({
			model: "openai/whisper-large-v3",
			file: new File([new Uint8Array(bytes)], "call.mp3", { type: "audio/mpeg" }),
			response_format: "json",
		});

		it.each([
			["groq", 25 * MB + 1, "25 MB"],
			["together", 80 * MB + 1, "80 MB"],
		])("rejects a %s upload over its documented limit before sending it", async (providerId, bytes, label) => {
			const mock = installFetchMock([]);
			const result = await exec(args(whisper(bytes), providerId));
			mock.restore();
			expect(mock.calls).toHaveLength(0);
			expect(result.upstream.status).toBe(400);
			expect(await result.upstream.clone().json()).toMatchObject({ error: { param: "file", message: expect.stringContaining(label) } });
		});

		it.each([
			["groq", 25 * MB],
			["together", 26 * MB],
		])("sends a %s upload within its limit", async (providerId, bytes) => {
			const mock = installFetchMock([{
				match: (url) => url.endsWith("/audio/transcriptions"),
				response: jsonResponse({ text: "ok" }),
			}]);
			const result = await exec(args(whisper(bytes), providerId));
			mock.restore();
			expect(mock.calls).toHaveLength(1);
			expect(result.upstream.status).toBe(200);
		});
	});
});
