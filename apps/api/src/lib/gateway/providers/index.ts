// lib/gateway/providers/index.ts
import type { Endpoint } from "../../types";
import type { ProviderAdapter } from "./types";
import { OpenAIAdapter } from "./openai/index";
import { GoogleAIStudioAdapter } from "./google-ai-studio/index";
import { AnthropicAdapter } from "./anthropic/index";
import { XAIAdapter } from "./x-ai/index";
import { XiaomiAdapter } from "./xiaomi/index";
import { AzureAdapter } from "./azure/index";
import { createOpenAICompatibleAdapter } from "./openai-compatible/index";
import { createUnsupportedAdapter } from "./unsupported";
import { getSupabaseAdmin } from "@/runtime/env";

// Adapter registry
const ADAPTERS: Record<string, ProviderAdapter> = {
    openai: OpenAIAdapter,
    "google-ai-studio": GoogleAIStudioAdapter,
    anthropic: AnthropicAdapter,
    "x-ai": XAIAdapter,
    xiaomi: XiaomiAdapter,
    azure: AzureAdapter,
    ai21: createOpenAICompatibleAdapter("ai21"),
    alibaba: createOpenAICompatibleAdapter("alibaba"),
    "atlas-cloud": createOpenAICompatibleAdapter("atlas-cloud"),
    baseten: createOpenAICompatibleAdapter("baseten"),
    cerebras: createOpenAICompatibleAdapter("cerebras"),
    chutes: createOpenAICompatibleAdapter("chutes"),
    cohere: createOpenAICompatibleAdapter("cohere"),
    deepinfra: createOpenAICompatibleAdapter("deepinfra"),
    deepseek: createOpenAICompatibleAdapter("deepseek"),
    groq: createOpenAICompatibleAdapter("groq"),
    minimax: createOpenAICompatibleAdapter("minimax"),
    mistral: createOpenAICompatibleAdapter("mistral"),
    moonshotai: createOpenAICompatibleAdapter("moonshotai"),
    novitaai: createOpenAICompatibleAdapter("novitaai"),
    parasail: createOpenAICompatibleAdapter("parasail"),
    qwen: createOpenAICompatibleAdapter("qwen"),
    together: createOpenAICompatibleAdapter("together"),
    "amazon-bedrock": createUnsupportedAdapter("amazon-bedrock", "aws_sigv4_required"),
    "google-vertex": createUnsupportedAdapter("google-vertex", "vertex_ai_required"),
    suno: createUnsupportedAdapter("suno", "non_openai_api"),
};

type CapabilityRow = { api_provider_id: string };

async function loadCapsFromDB(model: string, endpoint: Endpoint): Promise<CapabilityRow[]> {
    const supabase = getSupabaseAdmin();
    const nowISO = new Date().toISOString();
    const query = supabase
        .from("data_api_provider_models")
        .select("api_provider_id")
        .eq("api_model_id", model)
        .eq("endpoint", endpoint)
        .eq("is_active_gateway", true)
        .or([
            "and(effective_from.is.null,effective_to.is.null)",
            `and(effective_from.is.null,effective_to.gt.${nowISO})`,
            `and(effective_from.lte.${nowISO},effective_to.is.null)`,
            `and(effective_from.lte.${nowISO},effective_to.gt.${nowISO})`,
        ].join(","));
    const { data, error } = await query;

    if (error) {
        console.error("Error loading capabilities from DB:", error);
        return [];
    }
    return (data ?? []) as CapabilityRow[];
}

export async function providersFor(model: string, endpoint: Endpoint): Promise<ProviderAdapter[]> {
    const rows = await loadCapsFromDB(model, endpoint);
    return rows
        .map(r => ADAPTERS[r.api_provider_id])
        .filter((a): a is ProviderAdapter => Boolean(a));
}

export function allProviderNames(): string[] {
    return Object.keys(ADAPTERS);
}

export function adapterById(providerId: string): ProviderAdapter | null {
    return ADAPTERS[providerId] ?? null;
}
