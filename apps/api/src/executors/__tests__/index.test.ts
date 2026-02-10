import { describe, expect, it } from "vitest";
import { EXECUTORS_BY_PROVIDER, resolveProviderExecutor } from "../index";
import { normalizeProviderId } from "@/lib/config/providerAliases";

describe("resolveProviderExecutor", () => {
	it("resolves text.generate executors for primary and alpha providers", () => {
		const providers = [
			"ai21",
			"aion-labs",
			"aionlabs",
			"alibaba",
			"amazon-bedrock",
			"anthropic",
			"arcee-ai",
			"atlascloud",
			"azure",
			"baseten",
			"bytedance-seed",
			"cerebras",
			"chutes",
			"clarifai",
			"cloudflare",
			"deepinfra",
			"deepseek",
			"featherless",
			"fireworks",
			"friendli",
			"gmicloud",
			"google-ai-studio",
			"google-vertex",
			"groq",
			"hyperbolic",
			"inception",
			"infermatic",
			"inflection",
			"liquid-ai",
			"mancer",
			"minimax",
			"minimax-lightning",
			"mistral",
			"moonshot-ai",
			"moonshot-ai-turbo",
			"morph",
			"nebius-token-factory",
			"novitaai",
			"openai",
			"parasail",
			"perplexity",
			"phala",
			"relace",
			"sambanova",
			"siliconflow",
			"sourceful",
			"together",
			"weights-and-biases",
			"x-ai",
			"xai",
			"xiaomi",
			"z-ai",
			"zai",
			// Additional configured compat providers
			"cohere",
			"crusoe",
			"google",
			"qwen",
		];
		for (const provider of providers) {
			expect(resolveProviderExecutor(provider, "text.generate")).toBeTruthy();
		}
	});

	it("keeps unsupported non-openai-compatible auth providers disabled for text.generate", () => {
		expect(resolveProviderExecutor("black-forest-labs", "text.generate")).toBeNull();
		expect(resolveProviderExecutor("suno", "text.generate")).toBeNull();
	});

	it("resolves provider display-name aliases used in routing hints", () => {
		const displayNames = [
			"AI21",
			"AionLabs",
			"Alibaba",
			"Amazon Bedrock",
			"Anthropic",
			"AtlasCloud",
			"Azure",
			"Baseten",
			"ByteDance Seed",
			"Cerebras",
			"Chutes",
			"Clarifai",
			"Cloudflare",
			"DeepInfra",
			"DeepSeek",
			"Featherless",
			"Fireworks",
			"Friendli",
			"GMICloud",
			"Google AI Studio",
			"Google Vertex",
			"Groq",
			"Hyperbolic",
			"Inception",
			"Infermatic",
			"Inflection",
			"Liquid",
			"Mancer",
			"MiniMax",
			"MiniMax Lightning",
			"Mistral",
			"Moonshot AI",
			"Moonshot AI Turbo",
			"Morph",
			"Nebius Token Factory",
			"NovitaAI",
			"OpenAI",
			"Parasail",
			"Perplexity",
			"Phala",
			"Qwen",
			"Relace",
			"Sambanova",
			"SiliconFlow",
			"Sourceful",
			"Together",
			"Weights & Biases",
			"xAI",
			"z.AI",
			"Xiaomi",
			"Arcee AI",
		];

		for (const name of displayNames) {
			const providerId = normalizeProviderId(name);
			expect(
				resolveProviderExecutor(providerId, "text.generate"),
				`${name} -> ${providerId} should resolve text.generate executor`,
			).toBeTruthy();
		}
	});

	it("routes bedrock and vertex to native executors", () => {
		expect(resolveProviderExecutor("amazon-bedrock", "text.generate")).toBe(
			EXECUTORS_BY_PROVIDER["amazon-bedrock"]?.["text.generate"],
		);
		expect(resolveProviderExecutor("google-vertex", "text.generate")).toBe(
			EXECUTORS_BY_PROVIDER["google-vertex"]?.["text.generate"],
		);
	});

	it("maps video endpoint-style capabilities to video executors", () => {
		expect(resolveProviderExecutor("openai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("alibaba", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("qwen", "video.generation")).toBeTruthy();
	});

	it("resolves adapter-backed non-text executors only for supported providers", () => {
		expect(resolveProviderExecutor("openai", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.speech")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.translations")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "images.edits")).toBeNull();
		expect(resolveProviderExecutor("mistral", "ocr")).toBeTruthy();
		expect(resolveProviderExecutor("suno", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("elevenlabs", "music.generate")).toBeTruthy();

		expect(resolveProviderExecutor("anthropic", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("x-ai", "music.generate")).toBeNull();
	});
});
