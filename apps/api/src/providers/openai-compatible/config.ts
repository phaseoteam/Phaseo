// Purpose: Provider adapter module.
// Why: Encapsulates provider-specific configuration and endpoint mapping.
// How: Exposes provider-specific helpers for routing and execution.

import { getBindings } from "@/runtime/env";
import type { ProviderExecuteArgs } from "../types";
import { resolveProviderKey, type ResolvedKey } from "../keys";

export type OpenAICompatConfig = {
    providerId: string;
    baseUrl?: string;
    pathPrefix?: string;
    apiKeyEnv?: string;
    baseUrlEnv?: string;
    apiKeyHeader?: string;
    apiKeyPrefix?: string;
    supportsResponses?: boolean;
};

const OPENAI_CHAT_ONLY_MODELS = new Set<string>([
    "gpt-audio",
    "gpt-audio-mini",
    "openai/gpt-audio",
    "openai/gpt-audio-mini",
]);

const OPENAI_LEGACY_COMPLETIONS_MODELS = new Set<string>([
    "babbage-002",
    "davinci-002",
    "openai/babbage-002",
    "openai/davinci-002",
]);

const ALIBABA_RESPONSES_MODELS = new Set<string>([
    "qwen3.5-plus",
    "qwen3.5-plus-2026-02-15",
    "qwen3.5-397b-a17b",
    "qwen3-max",
    "qwen3-max-2026-01-23",
    "qwen3-max-preview",
    "qwen-plus",
    "qwen-plus-latest",
    "qwen-max",
    "qwen-max-latest",
]);

const ALIBABA_RESPONSES_PATH_PREFIX = "/api/v2/apps/protocols/compatible-mode/v1";

const OPENAI_COMPAT_CONFIG: Record<string, OpenAICompatConfig> = {
    openai: {
        providerId: "openai",
        baseUrl: "https://api.openai.com",
        pathPrefix: "/v1",
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrlEnv: "OPENAI_BASE_URL",
        supportsResponses: true,
    },
    // Alibaba DashScope OpenAI-compatible API
    alibaba: {
        providerId: "alibaba",
        baseUrl: "https://dashscope-intl.aliyuncs.com",
        pathPrefix: "/compatible-mode/v1",
        apiKeyEnv: "ALIBABA_API_KEY",
        baseUrlEnv: "ALIBABA_BASE_URL",
    },
    "atlas-cloud": {
        providerId: "atlas-cloud",
        baseUrl: "https://api.atlascloud.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "ATLAS_CLOUD_API_KEY",
        baseUrlEnv: "ATLAS_CLOUD_BASE_URL",
    },
    atlascloud: {
        providerId: "atlascloud",
        baseUrl: "https://api.atlascloud.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "ATLAS_CLOUD_API_KEY",
        baseUrlEnv: "ATLAS_CLOUD_BASE_URL",
    },
    arcee: {
        providerId: "arcee",
        baseUrl: "https://api.arcee.ai",
        pathPrefix: "/api/v1",
        apiKeyEnv: "ARCEE_API_KEY",
        baseUrlEnv: "ARCEE_BASE_URL",
        supportsResponses: false,
    },
    "arcee-ai": {
        providerId: "arcee-ai",
        baseUrl: "https://api.arcee.ai",
        pathPrefix: "/api/v1",
        apiKeyEnv: "ARCEE_API_KEY",
        baseUrlEnv: "ARCEE_BASE_URL",
        supportsResponses: false,
    },
    ai21: {
        providerId: "ai21",
        baseUrl: "https://api.ai21.com",
        pathPrefix: "/studio/v1",
        apiKeyEnv: "AI21_API_KEY",
        baseUrlEnv: "AI21_BASE_URL",
        supportsResponses: false,
    },
    "amazon-bedrock": {
        providerId: "amazon-bedrock",
        baseUrlEnv: "AMAZON_BEDROCK_BASE_URL",
        apiKeyEnv: "AMAZON_BEDROCK_API_KEY",
        pathPrefix: "/v1",
        supportsResponses: false,
    },
    baseten: {
        providerId: "baseten",
        baseUrl: "https://api.baseten.co",
        pathPrefix: "/v1",
        apiKeyEnv: "BASETEN_API_KEY",
        baseUrlEnv: "BASETEN_BASE_URL",
    },
    "bytedance-seed": {
        providerId: "bytedance-seed",
        baseUrlEnv: "BYTEDANCE_SEED_BASE_URL",
        apiKeyEnv: "BYTEDANCE_SEED_API_KEY",
        pathPrefix: "/v1",
        supportsResponses: false,
    },
    cerebras: {
        providerId: "cerebras",
        baseUrl: "https://api.cerebras.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "CEREBRAS_API_KEY",
        baseUrlEnv: "CEREBRAS_BASE_URL",
        supportsResponses: false,
    },
    clarifai: {
        providerId: "clarifai",
        baseUrl: "https://api.clarifai.com",
        pathPrefix: "/v2/ext/openai/v1",
        apiKeyEnv: "CLARIFAI_PAT",
        baseUrlEnv: "CLARIFAI_BASE_URL",
        supportsResponses: true,
    },
    chutes: {
        providerId: "chutes",
        baseUrl: "https://api.chutes.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "CHUTES_API_KEY",
        baseUrlEnv: "CHUTES_BASE_URL",
    },
    cohere: {
        providerId: "cohere",
        baseUrl: "https://api.cohere.ai",
        pathPrefix: "/compatibility/v1",
        apiKeyEnv: "COHERE_API_KEY",
        baseUrlEnv: "COHERE_BASE_URL",
    },
    deepinfra: {
        providerId: "deepinfra",
        baseUrl: "https://api.deepinfra.com",
        pathPrefix: "/v1/openai",
        apiKeyEnv: "DEEPINFRA_API_KEY",
        baseUrlEnv: "DEEPINFRA_BASE_URL",
    },
    deepseek: {
        providerId: "deepseek",
        baseUrl: "https://api.deepseek.com",
        pathPrefix: "/v1",
        apiKeyEnv: "DEEPSEEK_API_KEY",
        baseUrlEnv: "DEEPSEEK_BASE_URL",
    },
    featherless: {
        providerId: "featherless",
        baseUrl: "https://api.featherless.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "FEATHERLESS_API_KEY",
        baseUrlEnv: "FEATHERLESS_BASE_URL",
        apiKeyHeader: "Authentication",
    },
    friendli: {
        providerId: "friendli",
        baseUrl: "https://api.friendli.ai",
        pathPrefix: "/serverless/v1",
        apiKeyEnv: "FRIENDLI_TOKEN",
        baseUrlEnv: "FRIENDLI_BASE_URL",
    },
    gmicloud: {
        providerId: "gmicloud",
        baseUrl: "https://api.gmi-serving.com",
        pathPrefix: "/v1",
        apiKeyEnv: "GMI_API_KEY",
        baseUrlEnv: "GMI_BASE_URL",
    },
    "google-vertex": {
        providerId: "google-vertex",
        baseUrlEnv: "GOOGLE_VERTEX_BASE_URL",
        apiKeyEnv: "GOOGLE_VERTEX_API_KEY",
        pathPrefix: "",
        supportsResponses: false,
    },
    groq: {
        providerId: "groq",
        baseUrl: "https://api.groq.com",
        pathPrefix: "/openai/v1",
        apiKeyEnv: "GROQ_API_KEY",
        baseUrlEnv: "GROQ_BASE_URL",
        supportsResponses: true,
    },
    hyperbolic: {
        providerId: "hyperbolic",
        baseUrl: "https://api.hyperbolic.xyz",
        pathPrefix: "/v1",
        apiKeyEnv: "HYPERBOLIC_API_KEY",
        baseUrlEnv: "HYPERBOLIC_BASE_URL",
    },
    inception: {
        providerId: "inception",
        baseUrl: "https://api.inceptionlabs.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "INCEPTION_API_KEY",
        baseUrlEnv: "INCEPTION_BASE_URL",
    },
    infermatic: {
        providerId: "infermatic",
        baseUrl: "https://api.totalgpt.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "INFERMATIC_API_KEY",
        baseUrlEnv: "INFERMATIC_BASE_URL",
    },
    inflection: {
        providerId: "inflection",
        baseUrlEnv: "INFLECTION_BASE_URL",
        apiKeyEnv: "INFLECTION_API_KEY",
        pathPrefix: "/v1",
        supportsResponses: false,
    },
    mancer: {
        providerId: "mancer",
        baseUrl: "https://mancer.tech",
        pathPrefix: "/oai/v1",
        apiKeyEnv: "MANCER_API_KEY",
        baseUrlEnv: "MANCER_BASE_URL",
    },
    minimax: {
        providerId: "minimax",
        // MiniMax OpenAI compatibility docs use api.minimax.io.
        baseUrl: "https://api.minimax.io",
        pathPrefix: "/v1",
        apiKeyEnv: "MINIMAX_API_KEY",
        baseUrlEnv: "MINIMAX_BASE_URL",
    },
    "minimax-lightning": {
        providerId: "minimax-lightning",
        baseUrl: "https://api.minimax.io",
        pathPrefix: "/v1",
        apiKeyEnv: "MINIMAX_API_KEY",
        baseUrlEnv: "MINIMAX_BASE_URL",
    },
    mistral: {
        providerId: "mistral",
        baseUrl: "https://api.mistral.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "MISTRAL_API_KEY",
        baseUrlEnv: "MISTRAL_BASE_URL",
        supportsResponses: false,
    },
    "moonshot-ai": {
        providerId: "moonshot-ai",
        baseUrl: "https://api.moonshot.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "MOONSHOT_AI_API_KEY",
        baseUrlEnv: "MOONSHOT_AI_BASE_URL",
    },
    "moonshot-ai-turbo": {
        providerId: "moonshot-ai-turbo",
        baseUrl: "https://api.moonshot.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "MOONSHOT_AI_API_KEY",
        baseUrlEnv: "MOONSHOT_AI_BASE_URL",
    },
    morph: {
        providerId: "morph",
        baseUrl: "https://api.morphllm.com",
        pathPrefix: "/v1",
        apiKeyEnv: "MORPH_API_KEY",
        baseUrlEnv: "MORPH_BASE_URL",
    },
    morpheus: {
        providerId: "morpheus",
        baseUrl: "https://api.mor.org",
        pathPrefix: "/api/v1",
        apiKeyEnv: "MORPHEUS_API_KEY",
        baseUrlEnv: "MORPHEUS_BASE_URL",
    },
    novitaai: {
        providerId: "novitaai",
        baseUrl: "https://api.novita.ai",
        // Novita OpenAI-compatible endpoints are documented under /openai/v1.
        pathPrefix: "/openai/v1",
        apiKeyEnv: "NOVITA_API_KEY",
        baseUrlEnv: "NOVITA_BASE_URL",
        supportsResponses: false,
    },
    crusoe: {
        providerId: "crusoe",
        baseUrl: "https://api.crusoe.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "CRUSOE_API_KEY",
        baseUrlEnv: "CRUSOE_BASE_URL",
    },
    parasail: {
        providerId: "parasail",
        baseUrl: "https://api.parasail.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "PARASAIL_API_KEY",
        baseUrlEnv: "PARASAIL_BASE_URL",
    },
    qwen: {
        providerId: "qwen",
        baseUrl: "https://dashscope-intl.aliyuncs.com",
        pathPrefix: "/compatible-mode/v1",
        apiKeyEnv: "QWEN_API_KEY",
        baseUrlEnv: "QWEN_BASE_URL",
    },
    phala: {
        providerId: "phala",
        baseUrl: "https://api.redpill.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "PHALA_API_KEY",
        baseUrlEnv: "PHALA_BASE_URL",
        supportsResponses: false,
    },
    sambanova: {
        providerId: "sambanova",
        apiKeyEnv: "SAMBANOVA_API_KEY",
        baseUrlEnv: "SAMBANOVA_BASE_URL",
        pathPrefix: "",
        supportsResponses: false,
    },
    siliconflow: {
        providerId: "siliconflow",
        baseUrl: "https://api.siliconflow.com",
        pathPrefix: "/v1",
        apiKeyEnv: "SILICONFLOW_API_KEY",
        baseUrlEnv: "SILICONFLOW_BASE_URL",
    },
    "weights-and-biases": {
        providerId: "weights-and-biases",
        baseUrl: "https://api.inference.wandb.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "WANDB_API_KEY",
        baseUrlEnv: "WANDB_BASE_URL",
        supportsResponses: false,
    },
    together: {
        providerId: "together",
        baseUrl: "https://api.together.xyz",
        pathPrefix: "/v1",
        apiKeyEnv: "TOGETHER_API_KEY",
        baseUrlEnv: "TOGETHER_BASE_URL",
    },
    xiaomi: {
        providerId: "xiaomi",
        pathPrefix: "/v1",
        baseUrl: "https://api.xiaomimimo.com",
        apiKeyEnv: "XIAOMI_MIMO_API_KEY",
        baseUrlEnv: "XIAOMI_MIMO_BASE_URL",
        supportsResponses: false,
    },
    "google-ai-studio": {
        providerId: "google-ai-studio",
        pathPrefix: "/v1",
        apiKeyEnv: "GOOGLE_AI_STUDIO_API_KEY",
        baseUrlEnv: "GOOGLE_AI_STUDIO_BASE_URL",
    },
    google: {
        providerId: "google",
        pathPrefix: "/v1",
        apiKeyEnv: "GOOGLE_API_KEY",
        baseUrlEnv: "GOOGLE_BASE_URL",
    },
    "x-ai": {
        providerId: "x-ai",
        baseUrl: "https://api.x.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "X_AI_API_KEY",
        baseUrlEnv: "XAI_BASE_URL",
        supportsResponses: true,
    },
    xai: {
        providerId: "xai",
        baseUrl: "https://api.x.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "XAI_API_KEY",
        baseUrlEnv: "XAI_BASE_URL",
        supportsResponses: true,
    },
    cloudflare: {
        providerId: "cloudflare",
        baseUrlEnv: "CLOUDFLARE_AI_GATEWAY_BASE_URL",
        apiKeyEnv: "CLOUDFLARE_API_TOKEN",
        pathPrefix: "",
        supportsResponses: false,
    },
    // New providers - added during IR optimization and provider onboarding
    fireworks: {
        providerId: "fireworks",
        baseUrl: "https://api.fireworks.ai",
        pathPrefix: "/inference/v1",
        apiKeyEnv: "FIREWORKS_API_KEY",
        baseUrlEnv: "FIREWORKS_BASE_URL",
        supportsResponses: true,
    },
    perplexity: {
        providerId: "perplexity",
        baseUrl: "https://api.perplexity.ai",
        pathPrefix: "",
        apiKeyEnv: "PERPLEXITY_API_KEY",
        baseUrlEnv: "PERPLEXITY_BASE_URL",
        supportsResponses: false,
    },
    liquid: {
        providerId: "liquid",
        baseUrl: "https://api.liquid.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "LIQUID_API_KEY",
        baseUrlEnv: "LIQUID_BASE_URL",
    },
    "liquid-ai": {
        providerId: "liquid-ai",
        baseUrl: "https://api.liquid.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "LIQUID_AI_API_KEY",
        baseUrlEnv: "LIQUID_AI_BASE_URL",
    },
    "nebius-token-factory": {
        providerId: "nebius-token-factory",
        baseUrl: "https://api.tokenfactory.nebius.com",
        pathPrefix: "/v1",
        apiKeyEnv: "NEBIUS_API_KEY",
        baseUrlEnv: "NEBIUS_BASE_URL",
    },
    sourceful: {
        providerId: "sourceful",
        baseUrl: "https://api.sourceful.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "SOURCEFUL_API_KEY",
        baseUrlEnv: "SOURCEFUL_BASE_URL",
    },
    relace: {
        providerId: "relace",
        baseUrl: "https://api.relace.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "RELACE_API_KEY",
        baseUrlEnv: "RELACE_BASE_URL",
    },
    aionlabs: {
        providerId: "aionlabs",
        baseUrl: "https://api.aionlabs.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "AION_LABS_API_KEY",
        baseUrlEnv: "AION_LABS_BASE_URL",
    },
    "aion-labs": {
        providerId: "aion-labs",
        baseUrl: "https://api.aionlabs.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "AION_LABS_API_KEY",
        baseUrlEnv: "AION_LABS_BASE_URL",
    },
    "z-ai": {
        providerId: "z-ai",
        baseUrl: "https://api.z.ai",
        pathPrefix: "/api/paas/v4",
        apiKeyEnv: "ZAI_API_KEY",
        baseUrlEnv: "ZAI_BASE_URL",
    },
    zai: {
        providerId: "zai",
        baseUrl: "https://api.z.ai",
        pathPrefix: "/api/paas/v4",
        apiKeyEnv: "ZAI_API_KEY",
        baseUrlEnv: "ZAI_BASE_URL",
    },
};

function normalizePathSegment(value: string | undefined) {
    if (!value) return "";
    return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

export function resolveOpenAICompatConfig(providerId: string): OpenAICompatConfig {
    const fallback: OpenAICompatConfig = { providerId };
    const config = OPENAI_COMPAT_CONFIG[providerId] ?? fallback;
    const bindings = getBindings() as unknown as Record<string, string | undefined>;

    const baseUrl = (config.baseUrlEnv && bindings[config.baseUrlEnv]) || config.baseUrl;
    if (!baseUrl) {
        throw new Error(`${providerId}_base_url_missing`);
    }

    return {
        ...config,
        baseUrl,
    };
}

export function isOpenAICompatProvider(providerId: string): boolean {
    return Object.prototype.hasOwnProperty.call(OPENAI_COMPAT_CONFIG, providerId);
}

export function openAICompatUrl(providerId: string, path: string): string {
    const config = resolveOpenAICompatConfig(providerId);
    const suffix = normalizePathSegment(path);
    const isAlibabaResponsesRoute =
        (providerId === "alibaba" || providerId === "qwen") && suffix === "/responses";
    let base = config.baseUrl?.replace(/\/+$/, "") ?? "";
    const configuredPrefix = normalizePathSegment(
        isAlibabaResponsesRoute ? ALIBABA_RESPONSES_PATH_PREFIX : (config.pathPrefix ?? "/v1"),
    );
    let prefix = configuredPrefix;

    // Many provider docs specify a base URL that already includes a path prefix
    // (for example, `/v1` or `/compatible-mode/v1`). Avoid duplicating that path.
    if (configuredPrefix) {
        try {
            const parsed = new URL(base);
            const basePath = parsed.pathname.replace(/\/+$/, "");
            if (basePath === configuredPrefix || basePath.endsWith(configuredPrefix)) {
                prefix = "";
            } else if (isAlibabaResponsesRoute) {
                const chatPrefix = normalizePathSegment(config.pathPrefix ?? "");
                if (chatPrefix && (basePath === chatPrefix || basePath.endsWith(chatPrefix))) {
                    // Alibaba Responses lives under a different prefix than Chat.
                    // If callers configure base URL ending in chat prefix, trim it before appending responses prefix.
                    const trimmedBasePath = basePath.slice(0, basePath.length - chatPrefix.length).replace(/\/+$/, "");
                    base = `${parsed.origin}${trimmedBasePath}`;
                }
            }
        } catch {
            // Ignore parse failures; fallback keeps existing behavior.
        }
    }

    return `${base}${prefix}${suffix}`;
}

export function openAICompatHeaders(providerId: string, key: string): Record<string, string> {
    const config = resolveOpenAICompatConfig(providerId);
    const headerName = config.apiKeyHeader ?? "Authorization";
    const prefix = config.apiKeyPrefix ?? "Bearer ";
    const headerValue = prefix ? `${prefix}${key}` : key;
    return {
        [headerName]: headerValue,
        "Content-Type": "application/json",
    };
}

export function resolveOpenAICompatKey(args: ProviderExecuteArgs): ResolvedKey {
    const config = resolveOpenAICompatConfig(args.providerId);
    const envKey = config.apiKeyEnv;
    return resolveProviderKey(args, () => {
        if (!envKey) return undefined;
        const bindings = getBindings() as unknown as Record<string, string | undefined>;
        return bindings[envKey];
    });
}

export type OpenAICompatRoute = "responses" | "chat" | "legacy_completions";

function normalizeOpenAIModelName(model?: string | null): string {
    if (!model) return "";
    const value = model.trim();
    if (!value) return "";
    const parts = value.split("/");
    return parts[parts.length - 1] || value;
}

function supportsAlibabaResponsesModel(model?: string | null): boolean {
    const normalized = normalizeOpenAIModelName(model).toLowerCase();
    if (!normalized) return false;
    if (ALIBABA_RESPONSES_MODELS.has(normalized)) return true;
    // Allow pinned release tags in supported model families.
    return normalized.startsWith("qwen3.5-plus-")
        || normalized.startsWith("qwen3.5-397b-a17b-")
        || normalized.startsWith("qwen3-max-")
        || normalized.startsWith("qwen3-max-preview-")
        || normalized.startsWith("qwen-plus-")
        || normalized.startsWith("qwen-max-");
}

export function resolveOpenAICompatRoute(providerId: string, model?: string | null): OpenAICompatRoute {
    const config = resolveOpenAICompatConfig(providerId);
    const normalized = normalizeOpenAIModelName(model);

    if (providerId === "openai") {
        if (OPENAI_LEGACY_COMPLETIONS_MODELS.has(model ?? "") || OPENAI_LEGACY_COMPLETIONS_MODELS.has(normalized)) {
            return "legacy_completions";
        }
        if (OPENAI_CHAT_ONLY_MODELS.has(model ?? "") || OPENAI_CHAT_ONLY_MODELS.has(normalized)) {
            return "chat";
        }
        return "responses";
    }

    if (providerId === "alibaba" || providerId === "qwen") {
        return supportsAlibabaResponsesModel(normalized) ? "responses" : "chat";
    }

    if (typeof config.supportsResponses === "boolean") {
        return config.supportsResponses ? "responses" : "chat";
    }
    return "chat";
}

export function supportsOpenAICompatResponses(providerId: string, model?: string | null): boolean {
    const config = resolveOpenAICompatConfig(providerId);
    if (typeof config.supportsResponses === "boolean") return config.supportsResponses;
    return resolveOpenAICompatRoute(providerId, model) === "responses";
}
