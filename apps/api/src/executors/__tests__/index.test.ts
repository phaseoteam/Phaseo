import { describe, expect, it } from "vitest";
import { EXECUTORS_BY_PROVIDER, resolveProviderExecutor } from "../index";
import { normalizeProviderId } from "@/lib/config/providerAliases";

describe("resolveProviderExecutor", () => {
	it("resolves text.generate executors for primary and alpha providers", () => {
		const providers = [
				"ai21",
				"akashml",
				"aion-labs",
			"aionlabs",
			"alibaba",
			"amazon-bedrock",
			"anthropic",
			"arcee",
			"arcee-ai",
			"atlascloud",
			"azure",
			"baseten",
			"byteplus",
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
				"ionrouter",
				"liquid-ai",
			"longcat",
			"mancer",
			"minimax",
			"minimax-lightning",
			"mistral",
			"moonshot-ai",
			"moonshot-ai-turbo",
				"morph",
				"morpheus",
				"nebius-token-factory",
				"nebius-token-factory-eu-north-1",
				"nebius-token-factory-us-central-1",
				"novitaai",
			"openai",
			"parasail",
			"perplexity",
			"phala",
			"relace",
			"sambanova",
			"siliconflow",
			"sourceful",
			"stepfun",
			"tensorix",
			"thinking-machines",
			"together",
			"venice",
			"weights-and-biases",
			"voyage",
			"voyageai",
			"x-ai",
			"xai",
			"xiaomi",
			"z-ai",
			"zai",
			// Additional configured compat providers
			"cohere",
			"crofai",
			"crusoe",
			"nvidia",
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

	it("resolves embeddings for openai-compatible providers", () => {
		expect(resolveProviderExecutor("openai", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("together", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("mistral", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("cohere", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("voyage", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("voyageai", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("anthropic", "embeddings")).toBeNull();
	});

	it("resolves moderations for openai-compatible providers", () => {
		expect(resolveProviderExecutor("openai", "moderations")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "text.moderate")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "moderations")).toBeTruthy();
		expect(resolveProviderExecutor("together", "moderations")).toBeTruthy();
		expect(resolveProviderExecutor("mistral", "moderations")).toBeTruthy();
		expect(resolveProviderExecutor("anthropic", "moderations")).toBeNull();
	});

	it("resolves rerank for openai-compatible providers", () => {
		expect(resolveProviderExecutor("openai", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "text.rerank")).toBeTruthy();
		expect(resolveProviderExecutor("cohere", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("fireworks", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("voyage", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("voyageai", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("anthropic", "rerank")).toBeNull();
	});

	it("normalizes canonical provider ids used in routing hints", () => {
		const variants = [
			"OPENAI",
			"AION-LABS",
			"ARCEE-AI",
			"GOOGLE-AI-STUDIO",
			"GOOGLE-VERTEX",
			"MINIMAX-LIGHTNING",
			"MOONSHOT-AI",
			"WEIGHTS-AND-BIASES",
			"X-AI",
			"Z-AI",
		];

		for (const name of variants) {
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
		expect(resolveProviderExecutor("google-vertex", "video.generation")).toBe(
			EXECUTORS_BY_PROVIDER["google-vertex"]?.["video.generate"],
		);
	});

	it("prefers explicit provider-local wrapper executors over generic fallback when present", () => {
		for (const providerId of [
			"ai21",
			"akashml",
			"arcee",
			"arcee-ai",
			"alibaba-cloud",
			"atlas-cloud",
			"atlascloud",
			"baseten",
			"byteplus",
			"bytedance-seed",
			"cerebras",
			"chutes",
			"clarifai",
			"cloudflare",
			"cohere",
			"crofai",
			"crusoe",
			"featherless",
			"friendli",
			"fireworks",
			"gmicloud",
			"groq",
			"hyperbolic",
			"inception",
			"infermatic",
			"inflection",
			"ionrouter",
			"longcat",
			"liquid",
			"liquid-ai",
			"mancer",
			"morph",
			"morpheus",
			"nebius-token-factory",
			"nebius-token-factory-eu-north-1",
			"nebius-token-factory-us-central-1",
			"nvidia",
			"novita",
			"novitaai",
			"parasail",
			"perplexity",
			"phala",
			"poolside",
			"relace",
			"sambanova",
			"siliconflow",
			"sourceful",
			"stepfun",
			"tensorix",
			"venice",
			"venice-e2ee",
			"voyage",
			"voyageai",
			"weights-and-biases",
		]) {
			expect(resolveProviderExecutor(providerId, "text.generate")).toBe(
				EXECUTORS_BY_PROVIDER[providerId]?.["text.generate"],
			);
		}
	});

	it("maps video endpoint-style capabilities to video executors", () => {
		expect(resolveProviderExecutor("openai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("google", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("bytedance-seed", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("byteplus", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("alibaba", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("alibaba-cloud", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("qwen", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("runway", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("runwayml", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("x-ai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("xai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("minimax", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("minimax-lightning", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("novitaai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("novita", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("atlas-cloud", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("atlascloud", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("atlas-cloud", "video.generation")).toBe(
			EXECUTORS_BY_PROVIDER["atlas-cloud"]?.["video.generate"],
		);
		expect(resolveProviderExecutor("atlascloud", "video.generation")).toBe(
			EXECUTORS_BY_PROVIDER["atlascloud"]?.["video.generate"],
		);
		expect(resolveProviderExecutor("fal", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("fal-ai", "video.generation")).toBeNull();
	});

	it("resolves adapter-backed non-text executors only for supported providers", () => {
		expect(resolveProviderExecutor("openai", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.speech")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.translations")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("ai21", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("ai21", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("ai21", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("thinking-machines", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("thinking-machines", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("thinking-machines", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("xiaomi", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("xiaomi", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("xiaomi", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("novita", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("novita", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("novita", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("atlascloud", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("atlascloud", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("atlascloud", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("fireworks", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("arcee", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("arcee", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("arcee-ai", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("arcee-ai", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("morpheus", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("morpheus", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("xai", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("xai", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("black-forest-labs", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("black-forest-labs", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("google-vertex", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("google-vertex", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("google-vertex", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("mistral", "ocr")).toBeTruthy();
		expect(resolveProviderExecutor("suno", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("elevenlabs", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("minimax", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("minimax-lightning", "music.generate")).toBeTruthy();

		expect(resolveProviderExecutor("anthropic", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("x-ai", "music.generate")).toBeNull();
	});

	it("keeps major-provider multimodal capability wiring stable", () => {
		const expectEnabled = (provider: string, capability: string) => {
			expect(
				resolveProviderExecutor(provider, capability),
				`${provider} should support ${capability}`,
			).toBeTruthy();
		};
		const expectDisabled = (provider: string, capability: string) => {
			expect(
				resolveProviderExecutor(provider, capability),
				`${provider} should not support ${capability}`,
			).toBeNull();
		};

		// OpenAI: broad multimodal except music.generate
		expectEnabled("openai", "images.generations");
		expectEnabled("openai", "images.edits");
		expectEnabled("openai", "audio.speech");
		expectEnabled("openai", "audio.transcription");
		expectEnabled("openai", "audio.translations");
		expectEnabled("openai", "video.generation");
		expectDisabled("openai", "music.generate");
		// Google AI Studio: image/audio/music only (video disabled).
		expectDisabled("google-ai-studio", "video.generation");
		expectEnabled("google-ai-studio", "images.generations");
		expectEnabled("google-ai-studio", "images.edits");
		expectEnabled("google-ai-studio", "audio.speech");
		expectEnabled("google-ai-studio", "audio.transcription");
		expectEnabled("google-ai-studio", "audio.translations");
		expectEnabled("google-ai-studio", "music.generate");

		// Legacy "google" alias should be disabled across all capabilities.
		expectDisabled("google", "video.generation");
		expectDisabled("google", "images.generations");
		expectDisabled("google", "images.edits");
		expectDisabled("google", "audio.speech");
		expectDisabled("google", "audio.transcription");
		expectDisabled("google", "audio.translations");
		expectDisabled("google", "music.generate");

		// Google Vertex host: native video plus adapter-backed image/audio coverage.
		expectEnabled("google-vertex", "text.generate");
		expectEnabled("google-vertex", "images.generations");
		expectEnabled("google-vertex", "images.edits");
		expectEnabled("google-vertex", "audio.speech");
		expectEnabled("google-vertex", "audio.transcription");
		expectEnabled("google-vertex", "audio.translations");
		expectEnabled("google-vertex", "video.generation");
		expectDisabled("google-vertex", "music.generate");

		// xAI: direct video + OpenAI-compatible image/audio.
		expectEnabled("x-ai", "video.generation");
		expectEnabled("x-ai", "images.generations");
		expectEnabled("x-ai", "images.edits");
		expectEnabled("x-ai", "audio.speech");
		expectEnabled("x-ai", "audio.transcription");
		expectEnabled("x-ai", "audio.translations");
		expectDisabled("x-ai", "music.generate");

		expectEnabled("xai", "video.generation");
		expectEnabled("xai", "images.generations");
		expectEnabled("xai", "images.edits");
		expectEnabled("xai", "audio.speech");
		expectEnabled("xai", "audio.transcription");
		expectEnabled("xai", "audio.translations");
		expectDisabled("xai", "music.generate");

		// Alibaba/Qwen: direct video + OpenAI-compatible image/audio.
		expectEnabled("alibaba", "video.generation");
		expectEnabled("alibaba", "images.generations");
		expectEnabled("alibaba", "images.edits");
		expectEnabled("alibaba", "audio.speech");
		expectEnabled("alibaba", "audio.transcription");
		expectEnabled("alibaba", "audio.translations");
		expectDisabled("alibaba", "music.generate");

		expectEnabled("qwen", "video.generation");
		expectEnabled("qwen", "images.generations");
		expectEnabled("qwen", "images.edits");
		expectEnabled("qwen", "audio.speech");
		expectEnabled("qwen", "audio.transcription");
		expectEnabled("qwen", "audio.translations");
		expectDisabled("qwen", "music.generate");

		// MiniMax: direct video/music + OpenAI-compatible image/audio.
		for (const minimaxProvider of ["minimax", "minimax-lightning"]) {
			expectEnabled(minimaxProvider, "video.generation");
			expectEnabled(minimaxProvider, "music.generate");
			expectEnabled(minimaxProvider, "images.generations");
			expectEnabled(minimaxProvider, "images.edits");
			expectEnabled(minimaxProvider, "audio.speech");
			expectEnabled(minimaxProvider, "audio.transcription");
			expectEnabled(minimaxProvider, "audio.translations");
		}

		// Dedicated audio/music providers.
		expectEnabled("elevenlabs", "audio.speech");
		expectEnabled("elevenlabs", "audio.transcription");
		expectEnabled("elevenlabs", "music.generate");
		expectDisabled("elevenlabs", "video.generation");

		expectEnabled("suno", "music.generate");
		expectDisabled("suno", "audio.speech");
		expectDisabled("suno", "video.generation");

		// Image-focused provider.
		expectEnabled("black-forest-labs", "images.generations");
		expectEnabled("black-forest-labs", "images.edits");
		expectDisabled("black-forest-labs", "audio.speech");
		expectDisabled("black-forest-labs", "video.generation");
		expectDisabled("black-forest-labs", "music.generate");

		// Explicitly keep relay provider disabled.
		expectDisabled("fal", "video.generation");
		expectDisabled("fal-ai", "video.generation");
	});
});
