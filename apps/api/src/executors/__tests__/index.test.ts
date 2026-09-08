import { describe, expect, it } from "vitest";
import { EXECUTORS_BY_PROVIDER, resolveProviderExecutor } from "../index";
import { normalizeProviderId } from "@/lib/config/providerAliases";
import { OPENAI_COMPAT_CONFIG } from "@providers/openai-compatible/registry";

describe("resolveProviderExecutor", () => {
	it("registers every configured OpenAI-wire text provider explicitly", () => {
		for (const providerId of Object.keys(OPENAI_COMPAT_CONFIG)) {
			// Voyage uses the shared transport configuration for its native
			// embeddings and rerank APIs, but does not expose text generation.
			if (providerId === "voyage" || providerId === "voyageai") continue;
			expect(
				EXECUTORS_BY_PROVIDER[providerId]?.["text.generate"],
				`${providerId} must have a provider-owned text executor`,
			).toBeTruthy();
			expect(resolveProviderExecutor(providerId, "text.generate")).toBe(
				EXECUTORS_BY_PROVIDER[providerId]?.["text.generate"],
			);
		}
	});
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
			"stepfun",
			"tensorix",
			"thinking-machines",
			"together",
			"venice",
			"weights-and-biases",
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

	it("does not register text generation for Voyage retrieval-only APIs", () => {
		expect(resolveProviderExecutor("voyage", "text.generate")).toBeNull();
		expect(resolveProviderExecutor("voyageai", "text.generate")).toBeNull();
	});

	it("resolves embeddings for openai-compatible providers", () => {
		expect(resolveProviderExecutor("openai", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("together", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("together", "image.generate")).toBeTruthy();
		expect(resolveProviderExecutor("together", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("together", "audio.translations")).toBeTruthy();
		for (const providerId of ["alibaba-cloud", "alibaba", "qwen"]) {
			expect(resolveProviderExecutor(providerId, "embeddings")).toBeTruthy();
		}
		expect(resolveProviderExecutor("mistral", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("mistral-eu", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("upstage", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("nebius-token-factory", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("nebius-token-factory-eu-north-1", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("nebius-token-factory-fast", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("nebius-token-factory-us-central-1", "embeddings")).toBeNull();
		expect(resolveProviderExecutor("cohere", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("voyage", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("voyageai", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("anthropic", "embeddings")).toBeNull();
		expect(resolveProviderExecutor("cloudflare", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("tensorix", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("tensorx", "embeddings")).toBeTruthy();
	});

	it("resolves Cloudflare-hosted native media capabilities", () => {
		expect(resolveProviderExecutor("cloudflare", "image.generate")).toBeTruthy();
		expect(resolveProviderExecutor("cloudflare", "audio.transcribe")).toBeTruthy();
	});

	it("does not route Alibaba native media APIs through OpenAI-shaped endpoints", () => {
		for (const providerId of ["alibaba-cloud", "alibaba", "qwen"]) {
			for (const capability of ["audio.speech", "audio.transcription", "audio.translations"]) {
				expect(resolveProviderExecutor(providerId, capability)).toBeNull();
			}
			expect(resolveProviderExecutor(providerId, "video.generate")).toBeTruthy();
			expect(resolveProviderExecutor(providerId, "image.generate")).toBe(providerId === "alibaba-cloud" ? EXECUTORS_BY_PROVIDER["alibaba-cloud"]["image.generate"] : null);
			expect(resolveProviderExecutor(providerId, "image.edit")).toBe(providerId === "alibaba-cloud" ? EXECUTORS_BY_PROVIDER["alibaba-cloud"]["image.edit"] : null);
		}
	});

	it("does not register Nebius image generation after its serverless image retirement", () => {
		for (const providerId of [
			"nebius-token-factory",
			"nebius-token-factory-fast",
			"nebius-token-factory-eu-north-1",
			"nebius-token-factory-us-central-1",
		]) {
			expect(resolveProviderExecutor(providerId, "image.generate")).toBeNull();
		}
	});

	it("resolves moderations for openai-compatible providers", () => {
		expect(resolveProviderExecutor("openai", "moderations")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "text.moderate")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "moderations")).toBeNull();
		// Together exposes safety models through chat completions, not an OpenAI
		// compatible /moderations endpoint.
		expect(resolveProviderExecutor("together", "moderations")).toBeNull();
		expect(resolveProviderExecutor("mistral", "moderations")).toBeTruthy();
		expect(resolveProviderExecutor("mistral-eu", "moderations")).toBeNull();
		expect(resolveProviderExecutor("anthropic", "moderations")).toBeNull();
	});

	it("registers Mistral transcription only where model availability is verified", () => {
		expect(resolveProviderExecutor("mistral", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("mistral-eu", "audio.transcription")).toBeNull();
	});

	it("resolves rerank only for providers with a native rerank API", () => {
		expect(resolveProviderExecutor("openai", "rerank")).toBeNull();
		expect(resolveProviderExecutor("openai", "text.rerank")).toBeNull();
		expect(resolveProviderExecutor("openai-eu", "rerank")).toBeNull();
		expect(resolveProviderExecutor("openai-eu", "text.rerank")).toBeNull();
		expect(resolveProviderExecutor("cohere", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("fireworks", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("voyage", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("voyageai", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("anthropic", "rerank")).toBeNull();
		expect(resolveProviderExecutor("nebius-token-factory", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("nebius-token-factory-fast", "rerank")).toBeTruthy();
		expect(resolveProviderExecutor("nebius-token-factory-eu-north-1", "rerank")).toBeNull();
		expect(resolveProviderExecutor("nebius-token-factory-us-central-1", "rerank")).toBeNull();
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
			"stepfun",
			"tensorix",
			"venice",
			"venice-e2ee",
			"weights-and-biases",
		]) {
			expect(resolveProviderExecutor(providerId, "text.generate")).toBe(
				EXECUTORS_BY_PROVIDER[providerId]?.["text.generate"],
			);
		}
	});

	it("maps video endpoint-style capabilities to video executors", () => {
		expect(resolveProviderExecutor("openai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "video.generation")).toBeTruthy();
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
		expect(resolveProviderExecutor("minimax-lightning", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("novitaai", "video.generation")).toBeTypeOf("function");
		expect(resolveProviderExecutor("novita", "video.generation")).toBe(resolveProviderExecutor("novitaai", "video.generation"));
		expect(resolveProviderExecutor("atlas-cloud", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("atlascloud", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("atlas-cloud", "video.generation")).toBe(
			EXECUTORS_BY_PROVIDER["atlas-cloud"]?.["video.generate"],
		);
		expect(resolveProviderExecutor("atlascloud", "video.generation")).toBe(
			EXECUTORS_BY_PROVIDER["atlascloud"]?.["video.generate"],
		);
		expect(resolveProviderExecutor("fal", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("fal-ai", "video.generation")).toBeNull();
	});

	it("resolves adapter-backed non-text executors only for supported providers", () => {
		expect(resolveProviderExecutor("openai", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("meta", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("meta", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("byteplus", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("byteplus", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("bytedance-seed", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("bytedance-seed", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.speech")).toBeTruthy();
		expect(resolveProviderExecutor("parasail", "audio.speech")).toBeNull();
		expect(resolveProviderExecutor("openai", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "audio.translations")).toBeTruthy();
		expect(resolveProviderExecutor("openai", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("ai21", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("ai21", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("ai21", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("thinking-machines", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("thinking-machines", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("thinking-machines", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("xiaomi", "audio.speech")).toBeTruthy();
		expect(resolveProviderExecutor("xiaomi", "audio.transcription")).toBeTruthy();
		for (const capability of [
			"images.generations",
			"images.edits",
			"audio.translations",
			"video.generation",
		]) {
			expect(resolveProviderExecutor("xiaomi", capability)).toBeNull();
		}
		expect(resolveProviderExecutor("novita", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("novita", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("novita", "video.generation")).toBeTypeOf("function");
		expect(resolveProviderExecutor("atlascloud", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("atlascloud", "images.edits")).toBeNull();
		expect(resolveProviderExecutor("atlascloud", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("atlascloud", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("fireworks", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("arcee", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("arcee", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("arcee-ai", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("arcee-ai", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("morpheus", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("morpheus", "images.edits")).toBeNull();
		expect(resolveProviderExecutor("morpheus", "audio.speech")).toBeTruthy();
		expect(resolveProviderExecutor("morpheus", "audio.transcription")).toBeNull();
		expect(resolveProviderExecutor("morpheus", "embeddings")).toBeTruthy();
		expect(resolveProviderExecutor("morpheus", "audio.translations")).toBeNull();
		expect(resolveProviderExecutor("morpheus", "video.generation")).toBeNull();
		expect(resolveProviderExecutor("xai", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("xai", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("black-forest-labs", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("black-forest-labs", "images.edits")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "images.generations")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "images.edits")).toBeNull();
		expect(resolveProviderExecutor("google-ai-studio", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("google-ai-studio", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("google-vertex", "images.generations")).toBeNull();
		expect(resolveProviderExecutor("google-vertex", "audio.transcription")).toBeTruthy();
		expect(resolveProviderExecutor("google-vertex", "video.generation")).toBeTruthy();
		expect(resolveProviderExecutor("mistral", "ocr")).toBeTruthy();
		expect(resolveProviderExecutor("cohere", "parse")).toBeTruthy();
		expect(resolveProviderExecutor("cohere", "ocr")).toBeNull();
		expect(resolveProviderExecutor("mistral", "audio.speech")).toBeTruthy();
		expect(resolveProviderExecutor("mistral", "audio/speech")).toBeTruthy();
		// Regional model availability must be confirmed from the regional models endpoint;
		// the current catalog has no EU OCR offer, so do not advertise one speculatively.
		expect(resolveProviderExecutor("mistral-eu", "ocr")).toBeNull();
		expect(resolveProviderExecutor("suno", "music.generate")).toBeNull();
		expect(resolveProviderExecutor("elevenlabs", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("minimax", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("gmicloud", "audio.speech")).toBeTruthy();
		expect(resolveProviderExecutor("gmicloud", "music.generate")).toBeTruthy();
		expect(resolveProviderExecutor("minimax-lightning", "music.generate")).toBeNull();

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
		// Google AI Studio: dedicated image generation, TTS, music, and Veo adapters.
		expectEnabled("google-ai-studio", "video.generation");
		expectEnabled("google-ai-studio", "images.generations");
		expectDisabled("google-ai-studio", "images.edits");
		expectEnabled("google-ai-studio", "audio.speech");
		expectEnabled("google-ai-studio", "audio.transcription");
		expectDisabled("google-ai-studio", "audio.translations");
		expectEnabled("google-ai-studio", "music.generate");

		// Legacy "google" alias should be disabled across all capabilities.
		expectDisabled("google", "video.generation");
		expectDisabled("google", "images.generations");
		expectDisabled("google", "images.edits");
		expectDisabled("google", "audio.speech");
		expectDisabled("google", "audio.transcription");
		expectDisabled("google", "audio.translations");
		expectDisabled("google", "music.generate");

		// Google Vertex host: text, native transcription and Veo are implemented.
		expectEnabled("google-vertex", "text.generate");
		expectDisabled("google-vertex", "images.generations");
		expectDisabled("google-vertex", "images.edits");
		expectDisabled("google-vertex", "audio.speech");
		expectEnabled("google-vertex", "audio.transcription");
		expectDisabled("google-vertex", "audio.translations");
		expectEnabled("google-vertex", "video.generation");
		expectDisabled("google-vertex", "music.generate");

		// SpaceXAI: direct video + OpenAI-compatible image/audio.
		expectEnabled("x-ai", "video.generation");
		expectEnabled("x-ai", "images.generations");
		expectEnabled("x-ai", "images.edits");
		expectEnabled("x-ai", "audio.speech");
		expectEnabled("x-ai", "audio.transcription");
		expectDisabled("x-ai", "audio.translations");
		expectDisabled("x-ai", "music.generate");

		expectEnabled("xai", "video.generation");
		expectEnabled("xai", "images.generations");
		expectEnabled("xai", "images.edits");
		expectEnabled("xai", "audio.speech");
		expectEnabled("xai", "audio.transcription");
		expectDisabled("xai", "audio.translations");
		expectDisabled("xai", "music.generate");

		// Alibaba/Qwen: native video only; DashScope image/audio contracts are not OpenAI media routes.
		expectEnabled("alibaba", "video.generation");
		expectDisabled("alibaba", "images.generations");
		expectDisabled("alibaba", "images.edits");
		expectDisabled("alibaba", "audio.speech");
		expectDisabled("alibaba", "audio.transcription");
		expectDisabled("alibaba", "audio.translations");
		expectDisabled("alibaba", "music.generate");

		expectEnabled("qwen", "video.generation");
		expectDisabled("qwen", "images.generations");
		expectDisabled("qwen", "images.edits");
		expectDisabled("qwen", "audio.speech");
		expectDisabled("qwen", "audio.transcription");
		expectDisabled("qwen", "audio.translations");
		expectDisabled("qwen", "music.generate");

		// BytePlus: text/image support plus the direct Seedance video wrapper.
		expectEnabled("byteplus", "text.generate");
		expectEnabled("byteplus", "images.generations");
		expectEnabled("byteplus", "images.edits");
		expectEnabled("byteplus", "video.generation");
		expectDisabled("byteplus", "music.generate");

		// MiniMax: native images are available on the standard provider offer;
		// Lightning is the high-speed text offer and has no documented image models.
		for (const minimaxProvider of ["minimax", "minimax-lightning"]) {
			if (minimaxProvider === "minimax") {
				expectEnabled(minimaxProvider, "images.generations");
				expectEnabled(minimaxProvider, "images.edits");
			} else {
				expectDisabled(minimaxProvider, "images.generations");
				expectDisabled(minimaxProvider, "images.edits");
			}
			if (minimaxProvider === "minimax") expectEnabled(minimaxProvider, "audio.speech");
			else expectDisabled(minimaxProvider, "audio.speech");
			expectDisabled(minimaxProvider, "audio.transcription");
			expectDisabled(minimaxProvider, "audio.translations");
		}
		expectEnabled("minimax", "video.generation");
		expectEnabled("minimax", "music.generate");
		expectDisabled("minimax-lightning", "video.generation");
		expectDisabled("minimax-lightning", "music.generate");

		// Dedicated audio/music providers.
		expectEnabled("elevenlabs", "audio.speech");
		expectEnabled("elevenlabs", "audio.transcription");
		expectEnabled("elevenlabs", "music.generate");
		expectDisabled("elevenlabs", "video.generation");

		expectDisabled("suno", "music.generate");
		expectDisabled("suno", "audio.speech");
		expectDisabled("suno", "video.generation");

		// Image-focused provider.
		expectEnabled("black-forest-labs", "images.generations");
		expectEnabled("black-forest-labs", "images.edits");
		expectDisabled("black-forest-labs", "audio.speech");
		expectEnabled("black-forest-labs", "video.generation");
		expectDisabled("black-forest-labs", "music.generate");

		// Fal video generation is wired through its dedicated native executor.
		expectEnabled("fal", "video.generation");
		expectDisabled("fal-ai", "video.generation");
	});
});
