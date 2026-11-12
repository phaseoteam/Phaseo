import { describe, expect, it } from "vitest";
import { resolveProviderExecutor } from "../index";

// Snapshot of the providers that served active text.generate routes when the
// catalogue still lived in the repo (2026-10-28). Prod Supabase is now the source
// of truth; this list guards the executor registry against regressions.
const TEXT_GENERATE_PROVIDERS = [
	"aion-labs", "akashml", "alibaba-cloud", "amazon-bedrock", "ambient", "anthropic",
	"anthropic-aws", "anthropic-aws-us", "anthropic-us", "arcee-ai", "atlascloud", "avian",
	"azure", "baidu", "baseten", "byteplus", "canopy-wave", "cerebras",
	"cloudflare", "cohere", "deepinfra", "deepseek", "fireworks", "friendli",
	"gmicloud", "google-ai-studio", "google-vertex", "google-vertex-eu", "groq", "inception",
	"inflection", "io-net", "ionrouter", "longcat", "meta", "minimax",
	"minimax-lightning", "mistral", "mistral-eu", "modelscope", "moonshotai", "morph",
	"morpheus", "nebius-token-factory", "novita", "openai", "openai-eu", "ovhcloud",
	"parasail", "poolside", "reka", "relace", "sail-research", "sakana",
	"sambanova", "siliconflow", "spacex-ai", "stepfun", "streamlake", "tensorix",
	"together", "upstage", "venice", "wafer", "weights-and-biases", "xiaomi",
	"z-ai",
];

// Snapshot of the active non-text gateway capabilities per provider (2026-10-28).
const MEDIA_CAPABILITIES_BY_PROVIDER: Array<[string, string[]]> = [
	["alibaba-cloud", ["image.edit", "image.generate", "text.embed", "video.generate"]],
	["baidu", ["embeddings", "image.generate", "rerank"]],
	["black-forest-labs", ["video.generate"]],
	["byteplus", ["images.edits", "images.generations"]],
	["cloudflare", ["audio.transcribe", "text.embed"]],
	["cohere", ["embeddings", "parse", "rerank"]],
	["deepinfra", ["audio.speech", "audio.transcription", "image.edit", "image.generate", "text.embed", "video.generate"]],
	["elevenlabs", ["audio.speech", "audio.transcription", "music.generate"]],
	["fireworks", ["image.generate", "rerank", "text.embed"]],
	["friendli", ["audio.transcription"]],
	["gmicloud", ["audio.speech", "image.edit", "image.generate", "music.generate"]],
	["google-ai-studio", ["audio.speech", "audio.transcription", "images.generations", "music.generate", "text.embed", "video.generate"]],
	["google-vertex", ["audio.transcription", "text.embed", "video.generate"]],
	["groq", ["audio.transcription", "audio.translations"]],
	["ltx", ["video.generate"]],
	["meta", ["audio.transcription", "image.edit", "image.generate"]],
	["minimax", ["audio.speech", "image.edit", "image.generate", "music.generate", "video.generate"]],
	["mistral", ["audio.transcribe", "ocr", "text.embed", "text.moderate"]],
	["modelscope", ["image.edit", "image.generate"]],
	["morpheus", ["text.embed"]],
	["nebius-token-factory", ["embeddings"]],
	["novita", ["embeddings", "rerank", "video.generate"]],
	["openai", ["audio.speech", "audio.transcription", "audio.translations", "image.edit", "image.generate", "text.embed", "text.moderate", "video.generate"]],
	["ovhcloud", ["audio.speech", "image.generate"]],
	["parasail", ["embeddings"]],
	["perplexity", ["embeddings"]],
	["relace", ["text.rerank"]],
	["spacex-ai", ["audio.speech", "audio.transcription", "image.edit", "image.generate", "video.edit", "video.generate"]],
	["stepfun", ["audio.speech", "audio.transcription", "image.edit", "image.generate"]],
	["tensorix", ["text.embed"]],
	["together", ["audio.transcription", "audio.translations", "image.generate"]],
	["upstage", ["ocr", "text.embed"]],
	["voyage", ["rerank", "text.embed"]],
	["xiaomi", ["audio.speech", "audio.transcription"]],
];

describe("provider executor coverage", () => {
	it.each(TEXT_GENERATE_PROVIDERS)("resolves a text.generate executor for %s", (provider) => {
		expect(resolveProviderExecutor(provider, "text.generate"), `${provider} should resolve text.generate executor`).toBeTruthy();
	});

	it.each(MEDIA_CAPABILITIES_BY_PROVIDER)("resolves every active non-text capability for %s", (provider, capabilities) => {
		for (const capabilityId of capabilities) {
			expect(resolveProviderExecutor(provider, capabilityId), `${provider} should resolve ${capabilityId}`).toBeTruthy();
		}
	});
});
