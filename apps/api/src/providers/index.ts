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
import { CrofAIAdapter } from "./crofai/index";
import { TensorixAdapter } from "./tensorix/index";
import { ElevenLabsAdapter } from "./elevenlabs/index";
import { SunoAdapter } from "./suno/index";
import { createOpenAICompatibleAdapter } from "./openai-compatible/index";
import { createUnsupportedAdapter } from "./unsupported";
import { getSupabaseAdmin } from "@/runtime/env";
import { normalizeProviderId } from "@/lib/config/providerAliases";

// NOTE: All adapters are legacy and unused - the IR pipeline uses executors instead
// These are kept for backward compatibility but are never called in production
// See apps/api/src/pipeline/index.ts:49 "IR PIPELINE (MANDATORY - ONLY EXECUTION PATH)"

// Adapter registry (default per-provider)
const PRIVATE_MODEL_ADAPTER = createOpenAICompatibleAdapter("private-model");

const ADAPTERS: Record<string, ProviderAdapter> = {
    openai: OpenAIAdapter,
    "openai-eu": createOpenAICompatibleAdapter("openai-eu"),
    "google-ai-studio": GoogleAIStudioAdapter,
    anthropic: AnthropicAdapter,
    "anthropic-us": AnthropicAdapter,
    "anthropic-aws": AnthropicAdapter,
    "anthropic-aws-us": AnthropicAdapter,
    "spacex-ai": createOpenAICompatibleAdapter("spacex-ai"), // SpaceXAI is OpenAI-compatible, uses openai_compat executor
    "x-ai": createOpenAICompatibleAdapter("x-ai"),
    xai: createOpenAICompatibleAdapter("xai"),
    xiaomi: XiaomiAdapter,
    azure: AzureAdapter,
    ai21: AI21Adapter,
    akashml: createOpenAICompatibleAdapter("akashml"),
    ambient: createOpenAICompatibleAdapter("ambient"),
    avian: createOpenAICompatibleAdapter("avian"),
    baidu: createOpenAICompatibleAdapter("baidu"),
    arcee: createOpenAICompatibleAdapter("arcee"),
    "arcee-ai": createOpenAICompatibleAdapter("arcee-ai"),
    "bytedance-seed": createOpenAICompatibleAdapter("bytedance-seed"),
    byteplus: createOpenAICompatibleAdapter("byteplus"),
    mistral: createOpenAICompatibleAdapter("mistral"),
    "mistral-eu": createOpenAICompatibleAdapter("mistral-eu"),
    sakana: createOpenAICompatibleAdapter("sakana"),
    elevenlabs: ElevenLabsAdapter,
    suno: SunoAdapter,
    alibaba: createOpenAICompatibleAdapter("alibaba"),
    "alibaba-cloud": createOpenAICompatibleAdapter("alibaba-cloud"),
    "atlas-cloud": createOpenAICompatibleAdapter("atlas-cloud"),
    atlascloud: createOpenAICompatibleAdapter("atlas-cloud"), // Alias for database naming
    clarifai: createOpenAICompatibleAdapter("clarifai"),
    cloudflare: createOpenAICompatibleAdapter("cloudflare"),
    baseten: createOpenAICompatibleAdapter("baseten"),
    cerebras: createOpenAICompatibleAdapter("cerebras"),
    chutes: createOpenAICompatibleAdapter("chutes"),
    cohere: createOpenAICompatibleAdapter("cohere"),
    crofai: CrofAIAdapter,
    "canopy-wave": createOpenAICompatibleAdapter("canopy-wave"),
    tensorix: TensorixAdapter,
	tensorx: createOpenAICompatibleAdapter("tensorx"),
    voyage: createOpenAICompatibleAdapter("voyage"),
    voyageai: createOpenAICompatibleAdapter("voyageai"),
    crusoe: createOpenAICompatibleAdapter("crusoe"),
    deepinfra: createOpenAICompatibleAdapter("deepinfra"),
    "io-net": createOpenAICompatibleAdapter("io-net"),
    darkbloom: createOpenAICompatibleAdapter("darkbloom"),
    deepseek: createOpenAICompatibleAdapter("deepseek"),
    featherless: createOpenAICompatibleAdapter("featherless"),
    friendli: createOpenAICompatibleAdapter("friendli"),
    gmicloud: createOpenAICompatibleAdapter("gmicloud"),
    groq: createOpenAICompatibleAdapter("groq"),
    hyperbolic: createOpenAICompatibleAdapter("hyperbolic"),
    inception: createOpenAICompatibleAdapter("inception"),
    infermatic: createOpenAICompatibleAdapter("infermatic"),
    inflection: createOpenAICompatibleAdapter("inflection"),
    "inference-net": createOpenAICompatibleAdapter("inference-net"),
    ionrouter: createOpenAICompatibleAdapter("ionrouter"),
    longcat: createOpenAICompatibleAdapter("longcat"),
    mancer: createOpenAICompatibleAdapter("mancer"),
    mara: createOpenAICompatibleAdapter("mara"),
    minimax: createOpenAICompatibleAdapter("minimax"),
    "minimax-lightning": createOpenAICompatibleAdapter("minimax-lightning"),
    "moonshot-ai-turbo": createOpenAICompatibleAdapter("moonshot-ai-turbo"),
    moonshotai: createOpenAICompatibleAdapter("moonshotai"),
    "moonshotai-turbo": createOpenAICompatibleAdapter("moonshotai-turbo"),
    morph: createOpenAICompatibleAdapter("morph"),
    morpheus: createOpenAICompatibleAdapter("morpheus"),
    "nebius-token-factory": createOpenAICompatibleAdapter("nebius-token-factory"),
    "nebius-token-factory-eu-north-1": createOpenAICompatibleAdapter("nebius-token-factory-eu-north-1"),
    "nebius-token-factory-us-central-1": createOpenAICompatibleAdapter("nebius-token-factory-us-central-1"),
    "z-ai": createOpenAICompatibleAdapter("z-ai"),
    zai: createOpenAICompatibleAdapter("zai"),
    "moonshot-ai": createOpenAICompatibleAdapter("moonshot-ai"),
    novitaai: createOpenAICompatibleAdapter("novitaai"),
    novita: createOpenAICompatibleAdapter("novita"),
    parasail: createOpenAICompatibleAdapter("parasail"),
    phala: createOpenAICompatibleAdapter("phala"),
    poolside: createOpenAICompatibleAdapter("poolside"),
    qwen: createOpenAICompatibleAdapter("qwen"),
    ovhcloud: createOpenAICompatibleAdapter("ovhcloud"),
    sambanova: createOpenAICompatibleAdapter("sambanova"),
    "sail-research": createOpenAICompatibleAdapter("sail-research"),
    scaleway: createOpenAICompatibleAdapter("scaleway"),
    siliconflow: createOpenAICompatibleAdapter("siliconflow"),
    together: createOpenAICompatibleAdapter("together"),
    venice: createOpenAICompatibleAdapter("venice"),
    "venice-e2ee": createOpenAICompatibleAdapter("venice-e2ee"),
    "weights-and-biases": createOpenAICompatibleAdapter("weights-and-biases"),
    // New providers - added during IR optimization and provider onboarding
    fireworks: createOpenAICompatibleAdapter("fireworks"),
    perplexity: createOpenAICompatibleAdapter("perplexity"),
    liquid: createOpenAICompatibleAdapter("liquid"),
    "liquid-ai": createOpenAICompatibleAdapter("liquid-ai"),
    streamlake: createOpenAICompatibleAdapter("streamlake"),
    switchpoint: createOpenAICompatibleAdapter("switchpoint"),
    relace: createOpenAICompatibleAdapter("relace"),
    reka: createOpenAICompatibleAdapter("reka"),
    "aion-labs": createOpenAICompatibleAdapter("aion-labs"),
    aionlabs: createOpenAICompatibleAdapter("aion-labs"),
    "black-forest-labs": createUnsupportedAdapter("black-forest-labs", "image_only_provider"),
    "amazon-bedrock": createOpenAICompatibleAdapter("amazon-bedrock"),
    "google-vertex": createOpenAICompatibleAdapter("google-vertex"),
    "google-vertex-eu": createOpenAICompatibleAdapter("google-vertex-eu"),
    meta: createOpenAICompatibleAdapter("meta"),
    upstage: createOpenAICompatibleAdapter("upstage"),
    wafer: createOpenAICompatibleAdapter("wafer"),
    "tencent-cloud": createOpenAICompatibleAdapter("tencent-cloud"),
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
    const { data: providerModels, error: pmError }: { data: any[] | null; error: any } = await supabase
        .from("v2_model_provider_routes")
        .select("provider_api_model_id:provider_model_id, provider_id:provider_slug, effective_from, effective_to")
        .eq("model_slug", model)
        .eq("routing_enabled", true)
        .in("status", ["active", "degraded"])
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

    const { data: caps, error }: { data: any[] | null; error: any } = await supabase
        .from("v2_route_capabilities")
        .select("provider_api_model_id:provider_model_id, capability_id, effective_from, effective_to")
        .eq("capability_id", endpoint)
        .eq("status", "active")
        .in("provider_model_id", providerModelIds)
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
	const canonicalProviderId = normalizeProviderId(providerId);
	if (canonicalProviderId === "private-model") return PRIVATE_MODEL_ADAPTER;
	const override = ADAPTERS_BY_CAPABILITY[endpoint]?.[canonicalProviderId];
	return override ?? ADAPTERS[canonicalProviderId] ?? null;
}

// Backward-compat shim for legacy tests/tools that resolve adapters by provider only.
export function adapterById(providerId: string): ProviderAdapter | null {
	return ADAPTERS[normalizeProviderId(providerId)] ?? null;
}
