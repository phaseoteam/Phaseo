import type { Endpoint } from "@/lib/types";

export type ExecutionSurface =
    | "openai_chat"
    | "openai_responses"
    | "anthropic_messages"
    | "google_generateContent";

export type SurfaceCapabilities = {
    supportsTools: boolean;
    supportsResponseFormat: boolean;
    supportsStreaming: boolean;
};

export const SURFACE_CAPABILITIES: Record<ExecutionSurface, SurfaceCapabilities> = {
    openai_chat: {
        supportsTools: true,
        supportsResponseFormat: true,
        supportsStreaming: true,
    },
    openai_responses: {
        supportsTools: true,
        supportsResponseFormat: true,
        supportsStreaming: true,
    },
    anthropic_messages: {
        supportsTools: true,
        supportsResponseFormat: false,
        supportsStreaming: true,
    },
    google_generateContent: {
        supportsTools: true,
        supportsResponseFormat: false,
        supportsStreaming: true,
    },
};

export const SURFACE_ENDPOINT: Record<ExecutionSurface, Endpoint> = {
    openai_chat: "chat.completions",
    openai_responses: "responses",
    anthropic_messages: "chat.completions",
    google_generateContent: "chat.completions",
};

export function surfaceSupports(surface: ExecutionSurface, key: keyof SurfaceCapabilities): boolean {
    return SURFACE_CAPABILITIES[surface][key];
}
