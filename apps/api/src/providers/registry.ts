import type { ExecutionSurface } from "@/core/surfaces";

export type ProviderProfile = {
    id: string;
    label: string;
    surfaces: ExecutionSurface[];
    preferredSurface: ExecutionSurface;
    enabled: boolean;
    notes?: string;
};

const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
    openai: {
        id: "openai",
        label: "OpenAI",
        surfaces: ["openai_responses", "openai_chat"],
        preferredSurface: "openai_responses",
        enabled: true,
    },
    anthropic: {
        id: "anthropic",
        label: "Anthropic",
        surfaces: ["anthropic_messages", "openai_chat"],
        preferredSurface: "anthropic_messages",
        enabled: true,
    },
    "google-ai-studio": {
        id: "google-ai-studio",
        label: "Google AI Studio",
        surfaces: ["google_generateContent", "openai_chat"],
        preferredSurface: "google_generateContent",
        enabled: true,
    },
    "x-ai": {
        id: "x-ai",
        label: "xAI",
        surfaces: ["openai_responses", "openai_chat"],
        preferredSurface: "openai_responses",
        enabled: true,
    },
    xiaomi: {
        id: "xiaomi",
        label: "Xiaomi",
        surfaces: ["openai_chat"],
        preferredSurface: "openai_chat",
        enabled: true,
    },
    azure: {
        id: "azure",
        label: "Azure OpenAI",
        surfaces: ["openai_chat"],
        preferredSurface: "openai_chat",
        enabled: true,
    },
    "amazon-bedrock": {
        id: "amazon-bedrock",
        label: "Amazon Bedrock",
        surfaces: [],
        preferredSurface: "openai_chat",
        enabled: false,
        notes: "stub",
    },
    "google-vertex": {
        id: "google-vertex",
        label: "Google Vertex AI",
        surfaces: [],
        preferredSurface: "openai_chat",
        enabled: false,
        notes: "stub",
    },
    suno: {
        id: "suno",
        label: "Suno",
        surfaces: [],
        preferredSurface: "openai_chat",
        enabled: false,
        notes: "stub",
    },
};

const OPENAI_COMPAT_DEFAULT_SURFACES: ExecutionSurface[] = ["openai_chat"];

export function getProviderProfile(providerId: string): ProviderProfile {
    const profile = PROVIDER_PROFILES[providerId];
    if (profile) return profile;
    return {
        id: providerId,
        label: providerId,
        surfaces: OPENAI_COMPAT_DEFAULT_SURFACES,
        preferredSurface: "openai_chat",
        enabled: true,
        notes: "openai_compat_default",
    };
}

export function listProviderProfiles(): ProviderProfile[] {
    return Object.values(PROVIDER_PROFILES);
}
