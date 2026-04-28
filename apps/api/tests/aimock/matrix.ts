import { EXECUTORS_BY_PROVIDER, isProviderCapabilityEnabled } from "@executors/index";
import { OPENAI_COMPAT_CONFIG, supportsOpenAICompatResponses } from "@providers/openai-compatible/config";
import { setupTestRuntime } from "../helpers/runtime";

setupTestRuntime();

function hasExecutor(providerId: string, capability: string): boolean {
    return Boolean(EXECUTORS_BY_PROVIDER[providerId]?.[capability]);
}

function supportsCapability(providerId: string, capability: string): boolean {
    return isProviderCapabilityEnabled(providerId, capability);
}

function canonicalOpenAIV1Providers(): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const [providerId, config] of Object.entries(OPENAI_COMPAT_CONFIG)) {
        if (config.pathPrefix !== "/v1") continue;
        if (!hasExecutor(providerId, "text.generate")) continue;

        const dedupeKey = [
            config.baseUrlEnv ?? "",
            config.apiKeyEnv ?? "",
            config.pathPrefix ?? "",
            config.supportsResponses === true ? "responses" : "chat",
        ].join("|");

        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(providerId);
    }

    return out.sort((a, b) => a.localeCompare(b));
}

function unique(values: string[]): string[] {
    return [...new Set(values)];
}

export const AIMOCK_OPENAI_V1_PROVIDERS = canonicalOpenAIV1Providers();

export const AIMOCK_CHAT_PROVIDERS = unique([
    ...AIMOCK_OPENAI_V1_PROVIDERS,
    "anthropic",
    "google-ai-studio",
]).filter((providerId) => hasExecutor(providerId, "text.generate"));

export const AIMOCK_TOOL_PROVIDERS = [...AIMOCK_CHAT_PROVIDERS];

export const AIMOCK_RESPONSE_PROVIDERS = unique([
    ...AIMOCK_OPENAI_V1_PROVIDERS.filter((providerId) =>
        supportsOpenAICompatResponses(providerId, "aimock-openai-model")),
    "anthropic",
    "google-ai-studio",
]).filter((providerId) => hasExecutor(providerId, "text.generate"));

export const AIMOCK_MESSAGES_PROVIDERS = ["anthropic"].filter((providerId) =>
    hasExecutor(providerId, "text.generate"));

export const AIMOCK_EMBEDDING_PROVIDERS = unique([
    ...AIMOCK_OPENAI_V1_PROVIDERS.filter((providerId) => hasExecutor(providerId, "embeddings")),
]).filter((providerId) => hasExecutor(providerId, "embeddings") && providerId !== "google-ai-studio");

export const AIMOCK_STREAM_PROVIDERS = ["openai", "x-ai", "anthropic", "google-ai-studio"].filter(
    (providerId) => hasExecutor(providerId, "text.generate"),
);

export const AIMOCK_STRUCTURED_PROVIDERS = [
    "amazon-bedrock",
    "deepseek",
    "openai",
    "x-ai",
    "anthropic",
    "google-ai-studio",
].filter((providerId) => hasExecutor(providerId, "text.generate"));

export const AIMOCK_USAGE_PROVIDERS = [
    "openai",
    "x-ai",
    "anthropic",
].filter((providerId) => hasExecutor(providerId, "text.generate"));

export const AIMOCK_SEQUENCE_PROVIDERS = [
    "openai",
    "x-ai",
    "anthropic",
    "google-ai-studio",
].filter((providerId) => hasExecutor(providerId, "text.generate"));

export const AIMOCK_IMAGE_PROVIDERS = AIMOCK_OPENAI_V1_PROVIDERS.filter((providerId) =>
    supportsCapability(providerId, "image.generate") &&
    providerId !== "google-ai-studio");

export const AIMOCK_SPEECH_PROVIDERS = AIMOCK_OPENAI_V1_PROVIDERS.filter((providerId) =>
    supportsCapability(providerId, "audio.speech") &&
    providerId !== "google-ai-studio" &&
    providerId !== "xiaomi");

export const AIMOCK_TRANSCRIPTION_PROVIDERS = AIMOCK_OPENAI_V1_PROVIDERS.filter((providerId) =>
    supportsCapability(providerId, "audio.transcription") &&
    providerId !== "google-ai-studio");

export const AIMOCK_MODERATION_PROVIDERS = AIMOCK_OPENAI_V1_PROVIDERS.filter((providerId) =>
    supportsCapability(providerId, "moderations"));

export const AIMOCK_RERANK_PROVIDERS = AIMOCK_OPENAI_V1_PROVIDERS.filter((providerId) =>
    supportsCapability(providerId, "rerank"));

export const AIMOCK_VIDEO_PROVIDERS = [
    "amazon-bedrock",
    "deepseek",
    "mistral",
    "moonshot-ai",
    "xiaomi",
].filter((providerId) => supportsCapability(providerId, "video.generate"));
