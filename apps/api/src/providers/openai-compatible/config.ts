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

const OPENAI_COMPAT_CONFIG: Record<string, OpenAICompatConfig> = {
    openai: {
        providerId: "openai",
        baseUrl: "https://api.openai.com",
        pathPrefix: "/v1",
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrlEnv: "OPENAI_BASE_URL",
        supportsResponses: true,
    },
    // AI21 - NOT OpenAI compatible, has custom adapter
    alibaba: {
        providerId: "alibaba",
        baseUrl: "https://dashscope.aliyuncs.com",
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
    baseten: {
        providerId: "baseten",
        baseUrl: "https://api.baseten.co",
        pathPrefix: "/v1",
        apiKeyEnv: "BASETEN_API_KEY",
        baseUrlEnv: "BASETEN_BASE_URL",
    },
    cerebras: {
        providerId: "cerebras",
        baseUrl: "https://api.cerebras.ai",
        pathPrefix: "/v1",
        apiKeyEnv: "CEREBRAS_API_KEY",
        baseUrlEnv: "CEREBRAS_BASE_URL",
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
    groq: {
        providerId: "groq",
        baseUrl: "https://api.groq.com",
        pathPrefix: "/openai/v1",
        apiKeyEnv: "GROQ_API_KEY",
        baseUrlEnv: "GROQ_BASE_URL",
    },
    minimax: {
        providerId: "minimax",
        baseUrl: "https://api.minimax.chat",
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
    },
    moonshotai: {
        providerId: "moonshotai",
        baseUrl: "https://api.moonshot.cn",
        pathPrefix: "/v1",
        apiKeyEnv: "MOONSHOT_API_KEY",
        baseUrlEnv: "MOONSHOT_BASE_URL",
    },
    novitaai: {
        providerId: "novitaai",
        baseUrl: "https://api.novita.ai",
        pathPrefix: "/v3/openai",
        apiKeyEnv: "NOVITA_API_KEY",
        baseUrlEnv: "NOVITA_BASE_URL",
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
        baseUrl: "https://dashscope.aliyuncs.com",
        pathPrefix: "/compatible-mode/v1",
        apiKeyEnv: "QWEN_API_KEY",
        baseUrlEnv: "QWEN_BASE_URL",
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
    // New providers - added during IR optimization and provider onboarding
    fireworks: {
        providerId: "fireworks",
        baseUrl: "https://api.fireworks.ai",
        pathPrefix: "/inference/v1",
        apiKeyEnv: "FIREWORKS_API_KEY",
        baseUrlEnv: "FIREWORKS_BASE_URL",
    },
    perplexity: {
        providerId: "perplexity",
        baseUrl: "https://api.perplexity.ai",
        pathPrefix: "",
        apiKeyEnv: "PERPLEXITY_API_KEY",
        baseUrlEnv: "PERPLEXITY_BASE_URL",
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
        baseUrl: "https://api.studio.nebius.ai",
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
};

function normalizePathSegment(value: string | undefined) {
    if (!value) return "";
    return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

export function resolveOpenAICompatConfig(providerId: string): OpenAICompatConfig {
    const fallback: OpenAICompatConfig = { providerId };
    const config = OPENAI_COMPAT_CONFIG[providerId] ?? fallback;
    const bindings = getBindings() as Record<string, string | undefined>;

    const baseUrl = (config.baseUrlEnv && bindings[config.baseUrlEnv]) || config.baseUrl;
    if (!baseUrl) {
        throw new Error(`${providerId}_base_url_missing`);
    }

    return {
        ...config,
        baseUrl,
    };
}

export function openAICompatUrl(providerId: string, path: string): string {
    const config = resolveOpenAICompatConfig(providerId);
    const base = config.baseUrl?.replace(/\/+$/, "") ?? "";
    const prefix = normalizePathSegment(config.pathPrefix ?? "/v1");
    const suffix = normalizePathSegment(path);
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
        const bindings = getBindings() as Record<string, string | undefined>;
        return bindings[envKey];
    });
}

export function supportsOpenAICompatResponses(providerId: string): boolean {
    const config = resolveOpenAICompatConfig(providerId);
    if (typeof config.supportsResponses === "boolean") return config.supportsResponses;
    // Default to false - only OpenAI has Responses API
    return false;
}
