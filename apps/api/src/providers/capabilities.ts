// Purpose: Provider capability profile registry.
// Why: Keeps capability policy centralized so resolver logic stays simple and consistent.
// How: Exposes provider profile metadata and adapter-backed capability checks.

import { isOpenAICompatProvider } from "./openai-compatible/config";

export type AdapterBackedCapability =
	| "image.generate"
	| "image.edit"
	| "audio.speech"
	| "audio.transcription"
	| "audio.translations"
	| "ocr"
	| "music.generate";

export type ProviderCapabilityProfile = {
	textOnly?: boolean;
	adapterBackedOverrides?: Partial<Record<AdapterBackedCapability, boolean>>;
};

const PROVIDER_CAPABILITY_PROFILES: Record<string, ProviderCapabilityProfile> = {
	ai21: { textOnly: true },
	xiaomi: { textOnly: true },
};

export function getProviderCapabilityProfile(providerId: string): ProviderCapabilityProfile {
	return PROVIDER_CAPABILITY_PROFILES[providerId] ?? {};
}

function defaultAdapterBackedSupport(providerId: string, capability: AdapterBackedCapability): boolean {
	const profile = getProviderCapabilityProfile(providerId);
	const compatNonTextSupported = isOpenAICompatProvider(providerId) && !profile.textOnly;

	switch (capability) {
		case "image.generate":
			return compatNonTextSupported;
		case "image.edit":
			return compatNonTextSupported && providerId !== "google-ai-studio";
		case "audio.translations":
			return compatNonTextSupported && providerId !== "google-ai-studio";
		case "audio.speech":
		case "audio.transcription":
			return (compatNonTextSupported && providerId !== "google-ai-studio") || providerId === "elevenlabs";
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
