import type { Endpoint } from "@/lib/types";
import type { GatewayContextData, ProviderCandidate } from "@/lib/gateway/before/types";
import type { ExecutionSurface } from "./surfaces";
import { SURFACE_ENDPOINT } from "./surfaces";
import { getProviderProfile } from "@/providers/registry";

export type TextProtocol = "openai.chat" | "openai.responses" | "anthropic.messages";

export type ContextEntry = {
    endpoint: Endpoint;
    context: GatewayContextData;
    providers: ProviderCandidate[];
    resolvedModel?: string | null;
};

export type ExecutionPlan = {
    surface: ExecutionSurface;
    endpoint: Endpoint;
    context: GatewayContextData;
    providers: ProviderCandidate[];
    resolvedModel?: string | null;
};

const PROTOCOL_SURFACE_PREFERENCE: Record<TextProtocol, ExecutionSurface[]> = {
    "openai.chat": ["openai_responses", "openai_chat", "anthropic_messages", "google_generateContent"],
    "openai.responses": ["openai_responses", "openai_chat", "anthropic_messages", "google_generateContent"],
    "anthropic.messages": ["anthropic_messages", "openai_responses", "openai_chat", "google_generateContent"],
};

function selectProvidersForSurface(
    surface: ExecutionSurface,
    contexts: Map<Endpoint, ContextEntry>
): ContextEntry | null {
    const endpoint = SURFACE_ENDPOINT[surface];
    const entry = contexts.get(endpoint);
    if (!entry) return null;
    const providers = entry.providers.filter((provider) => {
        const profile = getProviderProfile(provider.providerId);
        return profile.enabled && profile.surfaces.includes(surface);
    });
    if (!providers.length) return null;
    return {
        ...entry,
        providers,
    };
}

function pickSurface(
    protocol: TextProtocol,
    contexts: Map<Endpoint, ContextEntry>
): ExecutionPlan | null {
    const preference = PROTOCOL_SURFACE_PREFERENCE[protocol] ?? PROTOCOL_SURFACE_PREFERENCE["openai.chat"];
    for (const surface of preference) {
        const entry = selectProvidersForSurface(surface, contexts);
        if (!entry) continue;
        return {
            surface,
            endpoint: entry.endpoint,
            context: entry.context,
            providers: entry.providers,
            resolvedModel: entry.resolvedModel,
        };
    }
    return null;
}

export function chooseExecutionPlan(
    protocol: TextProtocol,
    contexts: Map<Endpoint, ContextEntry>
): ExecutionPlan | null {
    const plan = pickSurface(protocol, contexts);
    if (plan) return plan;

    for (const entry of contexts.values()) {
        const providers = entry.providers.filter((provider) => getProviderProfile(provider.providerId).enabled);
        if (providers.length) {
            return {
                surface: "openai_chat",
                endpoint: entry.endpoint,
                context: entry.context,
                providers,
                resolvedModel: entry.resolvedModel,
            };
        }
    }
    return null;
}
