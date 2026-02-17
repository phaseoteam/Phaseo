// lib/gateway/providers/index.ts
// Purpose: Provider adapter module for index.ts.
// Why: Isolates provider-specific configuration and utilities.
// How: Exports provider registry and resolves adapters for routing.
import type { Endpoint } from "@core/types";
import type { ProviderAdapter } from "./types";
import { OpenAIAdapter } from "./openai/index";
import { GoogleAIStudioAdapter } from "./google-ai-studio/index";
import { AnthropicAdapter } from "./anthropic/index";
import { XiaomiAdapter } from "./xiaomi/index";
import { AzureAdapter } from "./azure/index";
import { AI21Adapter } from "./ai21/index";
import { MistralAdapter } from "./mistral/index";
import { ElevenLabsAdapter } from "./elevenlabs/index";
import { SunoAdapter } from "./suno/index";
import { createOpenAICompatibleAdapter } from "./openai-compatible/index";
import { createUnsupportedAdapter } from "./unsupported";
import { getSupabaseAdmin } from "@/runtime/env";

// NOTE: All adapters are legacy and unused - the IR pipeline uses executors instead
// These are kept for backward compatibility but are never called in production
// See apps/api/src/pipeline/index.ts:49 "IR PIPELINE (MANDATORY - ONLY EXECUTION PATH)"

// Adapter registry (default per-provider)
const ADAPTERS: Record<string, ProviderAdapter> = {
    openai: OpenAIAdapter,
    "google-ai-studio": GoogleAIStudioAdapter,
    anthropic: AnthropicAdapter,
    "x-ai": createOpenAICompatibleAdapter("x-ai"), // xAI is OpenAI-compatible, uses openai_compat executor
    xai: createOpenAICompatibleAdapter("xai"),
    xiaomi: XiaomiAdapter,
    azure: AzureAdapter,
    ai21: AI21Adapter,
    arcee: createOpenAICompatibleAdapter("arcee"),
    "arcee-ai": createOpenAICompatibleAdapter("arcee-ai"),
    "bytedance-seed": createOpenAICompatibleAdapter("bytedance-seed"),
    mistral: createOpenAICompatibleAdapter("mistral"),
    elevenlabs: ElevenLabsAdapter,
    suno: SunoAdapter,
    alibaba: createOpenAICompatibleAdapter("alibaba"),
    "atlas-cloud": createOpenAICompatibleAdapter("atlas-cloud"),
    atlascloud: createOpenAICompatibleAdapter("atlas-cloud"), // Alias for database naming
    clarifai: createOpenAICompatibleAdapter("clarifai"),
    cloudflare: createOpenAICompatibleAdapter("cloudflare"),
    baseten: createOpenAICompatibleAdapter("baseten"),
    cerebras: createOpenAICompatibleAdapter("cerebras"),
    chutes: createOpenAICompatibleAdapter("chutes"),
    cohere: createOpenAICompatibleAdapter("cohere"),
    crusoe: createOpenAICompatibleAdapter("crusoe"),
    deepinfra: createOpenAICompatibleAdapter("deepinfra"),
    deepseek: createOpenAICompatibleAdapter("deepseek"),
    featherless: createOpenAICompatibleAdapter("featherless"),
    friendli: createOpenAICompatibleAdapter("friendli"),
    gmicloud: createOpenAICompatibleAdapter("gmicloud"),
    google: createOpenAICompatibleAdapter("google"),
    groq: createOpenAICompatibleAdapter("groq"),
    hyperbolic: createOpenAICompatibleAdapter("hyperbolic"),
    inception: createOpenAICompatibleAdapter("inception"),
    infermatic: createOpenAICompatibleAdapter("infermatic"),
    inflection: createOpenAICompatibleAdapter("inflection"),
    mancer: createOpenAICompatibleAdapter("mancer"),
    minimax: createOpenAICompatibleAdapter("minimax"),
    "minimax-lightning": createOpenAICompatibleAdapter("minimax-lightning"),
    "moonshot-ai-turbo": createOpenAICompatibleAdapter("moonshot-ai-turbo"),
    morph: createOpenAICompatibleAdapter("morph"),
    morpheus: createOpenAICompatibleAdapter("morpheus"),
    "z-ai": createOpenAICompatibleAdapter("z-ai"),
    zai: createOpenAICompatibleAdapter("zai"),
    "moonshot-ai": createOpenAICompatibleAdapter("moonshot-ai"),
    novitaai: createOpenAICompatibleAdapter("novitaai"),
    parasail: createOpenAICompatibleAdapter("parasail"),
    phala: createOpenAICompatibleAdapter("phala"),
    qwen: createOpenAICompatibleAdapter("qwen"),
    sambanova: createOpenAICompatibleAdapter("sambanova"),
    siliconflow: createOpenAICompatibleAdapter("siliconflow"),
    together: createOpenAICompatibleAdapter("together"),
    "weights-and-biases": createOpenAICompatibleAdapter("weights-and-biases"),
    // New providers - added during IR optimization and provider onboarding
    fireworks: createOpenAICompatibleAdapter("fireworks"),
    perplexity: createOpenAICompatibleAdapter("perplexity"),
    liquid: createOpenAICompatibleAdapter("liquid"),
    "liquid-ai": createOpenAICompatibleAdapter("liquid-ai"),
    "nebius-token-factory": createOpenAICompatibleAdapter("nebius-token-factory"),
    sourceful: createOpenAICompatibleAdapter("sourceful"),
    relace: createOpenAICompatibleAdapter("relace"),
    "aion-labs": createOpenAICompatibleAdapter("aion-labs"),
    aionlabs: createOpenAICompatibleAdapter("aion-labs"),
    "black-forest-labs": createUnsupportedAdapter("black-forest-labs", "image_only_provider"),
    // Native auth (SigV4/OAuth) is not implemented yet; route via OpenAI-compatible gateways/proxies.
    "amazon-bedrock": createOpenAICompatibleAdapter("amazon-bedrock"),
    "google-vertex": createOpenAICompatibleAdapter("google-vertex"),
};

// Capability-specific adapter overrides (e.g. Mistral OCR)
const ADAPTERS_BY_CAPABILITY: Partial<Record<Endpoint, Record<string, ProviderAdapter>>> = {
    ocr: {
        mistral: MistralAdapter,
    },
};

type CapabilityRow = { provider_id: string };

async function loadCapsFromDB(model: string, endpoint: Endpoint): Promise<CapabilityRow[]> {
    const supabase = getSupabaseAdmin();
    const nowISO = new Date().toISOString();
    const { data: providerModels, error: pmError } = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id, provider_id, is_active_gateway, effective_from, effective_to")
        .eq("api_model_id", model)
        .eq("is_active_gateway", true)
        .or([
            "and(effective_from.is.null,effective_to.is.null)",
            `and(effective_from.is.null,effective_to.gt.${nowISO})`,
            `and(effective_from.lte.${nowISO},effective_to.is.null)`,
            `and(effective_from.lte.${nowISO},effective_to.gt.${nowISO})`,
        ].join(","));
    if (pmError) {
        console.error("Error loading provider models from DB:", pmError);
        return [];
    }
    const providerModelIds = (providerModels ?? [])
        .map((row) => row.provider_api_model_id)
        .filter((id): id is string => Boolean(id));
    if (!providerModelIds.length) return [];

    const { data: caps, error } = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id, capability_id, effective_from, effective_to")
        .eq("capability_id", endpoint)
        .eq("status", "active")
        .in("provider_api_model_id", providerModelIds)
        .or([
            "and(effective_from.is.null,effective_to.is.null)",
            `and(effective_from.is.null,effective_to.gt.${nowISO})`,
            `and(effective_from.lte.${nowISO},effective_to.is.null)`,
            `and(effective_from.lte.${nowISO},effective_to.gt.${nowISO})`,
        ].join(","));

    if (error) {
        console.error("Error loading capabilities from DB:", error);
        return [];
    }
    const providerById = new Map<string, string>();
    for (const row of providerModels ?? []) {
        if (row.provider_api_model_id && row.provider_id) {
            providerById.set(row.provider_api_model_id, row.provider_id);
        }
    }
    const rows: CapabilityRow[] = [];
    for (const cap of caps ?? []) {
        const provider_id = providerById.get(cap.provider_api_model_id);
        if (provider_id) rows.push({ provider_id });
    }
    return rows;
}

export async function providersFor(model: string, endpoint: Endpoint): Promise<ProviderAdapter[]> {
    const rows = await loadCapsFromDB(model, endpoint);
    return rows
        .map((r) => adapterFor(r.provider_id, endpoint))
        .filter((a): a is ProviderAdapter => Boolean(a));
}

export function allProviderNames(): string[] {
    return Array.from(
        new Set([
            ...Object.keys(ADAPTERS),
            ...Object.values(ADAPTERS_BY_CAPABILITY).flatMap((entry) =>
                entry ? Object.keys(entry) : []
            ),
        ])
    );
}

export function adapterFor(providerId: string, endpoint: Endpoint): ProviderAdapter | null {
    const override = ADAPTERS_BY_CAPABILITY[endpoint]?.[providerId];
    return override ?? ADAPTERS[providerId] ?? null;
}

// Backward-compat shim for legacy tests/tools that resolve adapters by provider only.
export function adapterById(providerId: string): ProviderAdapter | null {
    return ADAPTERS[providerId] ?? null;
}