import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProviderExecutor } from "../index";
import { openAICompatUrl } from "@providers/openai-compatible/config";
import { installFetchMock, jsonResponse } from "../../../tests/helpers/mock-fetch";
import { setupRuntimeFromEnv, teardownTestRuntime } from "../../../tests/helpers/runtime";
import { exec as compatibleSpeech } from "@providers/openai/endpoints/audio-speech";

beforeEach(() => setupRuntimeFromEnv({ DEEPINFRA_API_KEY: "test-key" } as any));
afterEach(teardownTestRuntime);

function args(endpoint: any, ir: any) {
	return { endpoint, ir, requestId: "deepinfra-media", workspaceId: "test", providerId: "deepinfra", byokMeta: [], pricingCard: { rules: [] }, meta: {} };
}

describe("DeepInfra IR media coverage", () => {
	it.each(["Qwen/Qwen3-TTS", "Qwen/Qwen3-TTS-VoiceDesign"])("uses native Qwen speech fields for %s", async model => {
		const mock = installFetchMock([{ match: url => url.endsWith(`/v1/inference/${model}`), response: new Response("audio", { headers: { "Content-Type": "audio/wav" } }) }]);
		try {
			const instructions = model.endsWith("VoiceDesign") ? undefined : "Whisper softly";
			const result = await resolveProviderExecutor("deepinfra", "audio.speech")!(args("audio.speech", { model, input: "Hello", voice: "A calm voice", instructions, responseFormat: "wav" }));
			expect(mock.calls[0].bodyJson).toMatchObject({ input: "Hello", voice: "A calm voice", response_format: "wav", service_tier: "default", ...(instructions ? { instruct: instructions } : {}) });
			expect(mock.calls[0].bodyJson).not.toHaveProperty("speed");
			expect(result.bill.usage?.input_characters).toBe(5);
		} finally { mock.restore(); }
	});
	it("preserves native voices for other OpenAI-compatible speech providers", async () => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ TOGETHER_API_KEY: "test-key" } as any);
		const mock = installFetchMock([{ match: (url) => url.endsWith("/audio/speech"), response: new Response("audio", { headers: { "Content-Type": "audio/wav" } }) }]);
		try {
			await compatibleSpeech({ providerId: "together", body: { model: "cartesia/sonic", input: "Hello", voice: "native-voice-id", response_format: "wav" }, byokMeta: [], meta: {} } as any);
			expect(mock.calls[0].bodyJson.voice).toBe("native-voice-id");
		} finally { mock.restore(); }
	});
	it.each(["https://api.deepinfra.com", "https://api.deepinfra.com/v1", "https://api.deepinfra.com/v1/openai"])("resolves media endpoints from %s", (base) => {
		teardownTestRuntime();
		setupRuntimeFromEnv({ DEEPINFRA_BASE_URL: base } as any);
		expect(openAICompatUrl("deepinfra", "/images/generations")).toBe("https://api.deepinfra.com/v1/images/generations");
		expect(openAICompatUrl("deepinfra", "/audio/speech")).toBe("https://api.deepinfra.com/v1/audio/speech");
	});

	it.each(["BAAI/bge-m3", "google/embeddinggemma-300m", "Qwen/Qwen3-Embedding-0.6B", "Qwen/Qwen3-Embedding-4B", "Qwen/Qwen3-Embedding-8B"])("retains embedding model IDs and options for %s through the registered executor", async (slug) => {
		const mock = installFetchMock([{ match: (url) => url.endsWith("/v1/openai/embeddings"), response: jsonResponse({ object: "list", data: [{ index: 0, embedding: [0.5] }], usage: { prompt_tokens: 3, total_tokens: 3 } }) }]);
		try {
			const executor = resolveProviderExecutor("deepinfra", "text.embed")!;
			const result = await executor({ ...args("embeddings", { model: slug.toLowerCase(), input: "test", dimensions: 512, encodingFormat: "float" }), providerModelSlug: slug });
			expect(mock.calls[0].bodyJson).toEqual({ model: slug, input: "test", dimensions: 512, encoding_format: "float" });
			expect(result.bill.usage?.embedding_tokens).toBe(3);
		} finally { mock.restore(); }
	});

	it("executes image generation through IR with the provider model and output controls", async () => {
		const mock = installFetchMock([{ match: (url) => url.endsWith("/v1/inference/black-forest-labs/FLUX-1-schnell"), response: jsonResponse({ images: ["data:image/png;base64,aGVsbG8="], inference_status: { cost: 0.0005 } }) }]);
		try {
			const executor = resolveProviderExecutor("deepinfra", "image.generate")!;
			const result = await executor(args("images.generations", { model: "black-forest-labs/FLUX-1-schnell", prompt: "A tree", n: 1, size: "1024x1024", responseFormat: "b64_json" }));
			expect(mock.calls[0].bodyJson).toEqual({ prompt: "A tree", num_images: 1, width: 1024, height: 1024 });
			expect(result.kind === "completed" && result.upstream.ok).toBe(true);
			expect(result.bill.usage?.output_image).toBe(1);
		} finally { mock.restore(); }
	});

	it("accepts provider-native voices and preserves binary speech", async () => {
		const mock = installFetchMock([{ match: (url) => url.endsWith("/v1/audio/speech"), response: new Response("audio-bytes", { headers: { "Content-Type": "audio/wav" } }) }]);
		try {
			const executor = resolveProviderExecutor("deepinfra", "audio.generate")!;
			const result = await executor(args("audio.speech", { model: "hexgrad/Kokoro-82M", input: "Hello", voice: "af_bella", responseFormat: "wav", speed: 1.25 }));
			expect(mock.calls[0].bodyJson).toMatchObject({ voice: "af_bella", response_format: "wav", speed: 1.25 });
			expect(result.kind).toBe("stream");
			if (result.kind === "stream") expect(await new Response(result.stream).text()).toBe("audio-bytes");
			expect(result.bill.usage?.input_characters).toBe(5);
		} finally { mock.restore(); }
	});

	it("forwards transcription file, language, prompt and temperature", async () => {
		let form: FormData | undefined;
		const mock = installFetchMock([{ match: (url, init) => { form = init?.body as FormData; return url.endsWith("/v1/audio/transcriptions"); }, response: jsonResponse({ text: "hello", duration: 1 }) }]);
		try {
			const executor = resolveProviderExecutor("deepinfra", "audio.transcribe")!;
			const result = await executor(args("audio.transcription", { model: "openai/whisper-large-v3", file: new Blob(["RIFF"], { type: "audio/wav" }), language: "en", prompt: "Names", temperature: 0, responseFormat: "json" }));
			expect(form?.get("file")).toBeInstanceOf(Blob);
			expect(form?.get("language")).toBe("en");
			expect(form?.get("prompt")).toBe("Names");
			expect(form?.get("temperature")).toBe("0");
			expect(result.kind === "completed" && (result.ir as any)?.text).toBe("hello");
		} finally { mock.restore(); }
	});
});
