// Purpose: Provider capability profile registry.
// Why: Keeps capability policy centralized so resolver logic stays simple and consistent.
// How: Exposes provider profile metadata and adapter-backed capability checks.

import { isOpenAICompatProvider } from "./openai-compatible/config";
import {
	getProviderProfile,
	type AdapterBackedCapability,
} from "./providerProfiles";
export type { AdapterBackedCapability } from "./providerProfiles";

export type ProviderCapabilityProfile = {
	textOnly?: boolean;
	adapterBackedOverrides?: Partial<Record<AdapterBackedCapability, boolean>>;
};

const FULL_MULTIMODAL_VIDEO_PROVIDERS = new Set<string>([
	"openai",
	"google-ai-studio",
	"google-vertex",
	"amazon-bedrock",
	"x-ai",
	"xai",
	"deepseek",
	"minimax",
	"minimax-lightning",
	"cerebras",
	"mistral",
	"moonshot-ai",
	"moonshot-ai-turbo",
	"novitaai",
	"alibaba",
	"qwen",
	"xiaomi",
	"z-ai",
	"zai",
]);

export function getProviderCapabilityProfile(providerId: string): ProviderCapabilityProfile {
	const profile = getProviderProfile(providerId);
	if (!profile) return {};
	return {
		textOnly: profile.textOnly,
		adapterBackedOverrides: profile.adapterBackedOverrides,
	};
}

function defaultAdapterBackedSupport(providerId: string, capability: AdapterBackedCapability): boolean {
	const profile = getProviderCapabilityProfile(providerId);
	const compatNonTextSupported = isOpenAICompatProvider(providerId) && !profile.textOnly;

	switch (capability) {
		case "image.generate":
			return compatNonTextSupported;
		case "image.edit":
			return compatNonTextSupported;
		case "audio.translations":
			return compatNonTextSupported;
		case "video.generate":
			return compatNonTextSupported && FULL_MULTIMODAL_VIDEO_PROVIDERS.has(providerId);
		case "audio.speech":
		case "audio.transcription":
			return compatNonTextSupported || providerId === "elevenlabs";
		case "ocr":
			return providerId === "mistral";
		case "music.generate":
			return providerId === "suno" || providerId === "elevenlabs";
		default:
			return false;
	}
}

export function supportsAdapterBackedCapability(providerId: string, capability: AdapterBackedCapability): boolean {
	const profile = getProviderCapabilityProfile(providerId);
	const explicit = profile.adapterBackedOverrides?.[capability];
	if (typeof explicit === "boolean") return explicit;
	return defaultAdapterBackedSupport(providerId, capability);
}
