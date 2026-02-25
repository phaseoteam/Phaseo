export type PlatformDiscoveryRule = {
    platformId: string;
    platformName: string;
    providerIds: string[];
    modelsEndpoint: string | null;
    active: boolean;
    reason?: string;
};

export type ProviderDiscoveryRule = {
    providerId: string;
    platformId: string;
    platformName: string;
    modelsEndpoint: string | null;
    active: boolean;
    reason?: string;
};

// Catalog based on the API platform list shared by product.
export const PLATFORM_DISCOVERY_RULES: PlatformDiscoveryRule[] = [
    {
        platformId: "ai21",
        platformName: "AI21",
        providerIds: ["ai21"],
        modelsEndpoint: "https://api.ai21.com/studio/v1/models",
        active: true,
    },
    {
        platformId: "aionlabs",
        platformName: "AionLabs",
        providerIds: ["aion-labs"],
        modelsEndpoint: "https://api.aionlabs.ai/v1/models",
        active: true,
    },
    {
        platformId: "alibaba-cloud",
        platformName: "Alibaba Cloud",
        providerIds: ["alibaba"],
        modelsEndpoint: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models",
        active: true,
    },
    {
        platformId: "amazon-bedrock",
        platformName: "Amazon Bedrock",
        providerIds: ["amazon-bedrock"],
        modelsEndpoint: null,
        active: false,
        reason: "No stable models discovery endpoint configured yet.",
    },
    {
        platformId: "anthropic",
        platformName: "Anthropic",
        providerIds: ["anthropic"],
        modelsEndpoint: "https://api.anthropic.com/v1/models",
        active: true,
    },
    {
        platformId: "arcee-ai",
        platformName: "Arcee AI",
        providerIds: ["arcee-ai"],
        modelsEndpoint: "https://api.arcee.ai/api/v1/models",
        active: true,
    },
    {
        platformId: "atlascloud",
        platformName: "AtlasCloud",
        providerIds: ["atlascloud"],
        modelsEndpoint: "https://api.atlascloud.ai/api/v1/models",
        active: true,
    },
    {
        platformId: "azure",
        platformName: "Azure",
        providerIds: ["azure"],
        modelsEndpoint: null,
        active: false,
        reason: "No single public models endpoint; deployment-specific discovery differs.",
    },
    {
        platformId: "baseten",
        platformName: "Baseten",
        providerIds: ["baseten"],
        modelsEndpoint: "https://inference.baseten.co/v1/models",
        active: true,
    },
    {
        platformId: "black-forest-labs",
        platformName: "Black Forest Labs",
        providerIds: [],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "bytedance-seed",
        platformName: "ByteDance Seed",
        providerIds: ["bytedance-seed"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "cerebras",
        platformName: "Cerebras",
        providerIds: ["cerebras"],
        modelsEndpoint: "https://api.cerebras.ai/v1/models",
        active: true,
    },
    {
        platformId: "chutes",
        platformName: "Chutes",
        providerIds: ["chutes"],
        modelsEndpoint: "https://llm.chutes.ai/v1/models",
        active: true,
    },
    {
        platformId: "clarifai",
        platformName: "Clarifai",
        providerIds: ["clarifai"],
        modelsEndpoint: "https://api.clarifai.com/v2/models",
        active: true,
    },
    {
        platformId: "cloudflare",
        platformName: "Cloudflare",
        providerIds: ["cloudflare"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "cohere",
        platformName: "Cohere",
        providerIds: ["cohere"],
        modelsEndpoint: "https://api.cohere.ai/compatibility/v1/models",
        active: true,
    },
    {
        platformId: "crusoe",
        platformName: "Crusoe",
        providerIds: ["crusoe"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "deepinfra",
        platformName: "DeepInfra",
        providerIds: ["deepinfra"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "deepseek",
        platformName: "DeepSeek",
        providerIds: ["deepseek"],
        modelsEndpoint: "https://api.deepseek.com/models",
        active: true,
    },
    {
        platformId: "elevenlabs",
        platformName: "ElevenLabs",
        providerIds: ["elevenlabs"],
        modelsEndpoint: "https://api.elevenlabs.io/v1/models",
        active: true,
    },
    {
        platformId: "fireworks",
        platformName: "Fireworks",
        providerIds: ["fireworks"],
        modelsEndpoint: "https://api.fireworks.ai/inference/v1/models",
        active: true,
    },
    {
        platformId: "friendli",
        platformName: "Friendli",
        providerIds: ["friendli"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "gmicloud",
        platformName: "GMICloud",
        providerIds: ["gmicloud"],
        modelsEndpoint: "https://api.gmi-serving.com/v1/models",
        active: true,
    },
    {
        platformId: "google-ai-studio",
        platformName: "Google AI Studio",
        providerIds: ["google-ai-studio"],
        modelsEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
        active: true,
    },
    {
        platformId: "google-vertex",
        platformName: "Google Vertex",
        providerIds: ["google-vertex"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "groq",
        platformName: "Groq",
        providerIds: ["groq"],
        modelsEndpoint: "https://api.groq.com/openai/v1/models",
        active: true,
    },
    {
        platformId: "hyperbolic",
        platformName: "Hyperbolic",
        providerIds: ["hyperbolic"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "inception",
        platformName: "Inception",
        providerIds: ["inception"],
        modelsEndpoint: "https://api.inceptionlabs.ai/v1/models",
        active: true,
    },
    {
        platformId: "inceptron",
        platformName: "Inceptron",
        providerIds: [],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "infermatic",
        platformName: "Infermatic",
        providerIds: ["infermatic"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "inflection",
        platformName: "Inflection",
        providerIds: ["inflection"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "minimax",
        platformName: "MiniMax",
        providerIds: ["minimax", "minimax-lightning"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "mistral",
        platformName: "Mistral",
        providerIds: ["mistral"],
        modelsEndpoint: "https://api.mistral.ai/v1/models",
        active: true,
    },
    {
        platformId: "moonshot-ai",
        platformName: "Moonshot AI",
        providerIds: ["moonshot-ai", "moonshot-ai-turbo"],
        modelsEndpoint: "https://api.moonshot.ai/v1/models",
        active: true,
    },
    {
        platformId: "morph",
        platformName: "Morph",
        providerIds: ["morph"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "nebius-token-factory",
        platformName: "Nebius Token Factory",
        providerIds: ["nebius-token-factory"],
        modelsEndpoint: "https://api.tokenfactory.nebius.com/v1/models",
        active: true,
    },
    {
        platformId: "nextbit",
        platformName: "NextBit",
        providerIds: ["nextbit"],
        modelsEndpoint: "https://api.nextbit256.com/v1/models",
        active: true,
    },
    {
        platformId: "novitaai",
        platformName: "NovitaAI",
        providerIds: ["novitaai"],
        modelsEndpoint: "https://api.novita.ai/openai/v1/models",
        active: true,
    },
    {
        platformId: "nvidia",
        platformName: "Nvidia",
        providerIds: ["nvidia"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "openai",
        platformName: "OpenAI",
        providerIds: ["openai"],
        modelsEndpoint: "https://api.openai.com/v1/models",
        active: true,
    },
    {
        platformId: "parasail",
        platformName: "Parasail",
        providerIds: ["parasail"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "perplexity",
        platformName: "Perplexity",
        providerIds: ["perplexity"],
        modelsEndpoint: "https://api.perplexity.ai/v1/models",
        active: true,
    },
    {
        platformId: "phala",
        platformName: "Phala",
        providerIds: ["phala"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "sambanova",
        platformName: "Sambanova",
        providerIds: ["sambanova"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "siliconflow",
        platformName: "SiliconFlow",
        providerIds: ["siliconflow"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "sourceful",
        platformName: "Sourceful",
        providerIds: ["sourceful"],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "stepfun",
        platformName: "StepFun",
        providerIds: ["stepfun"],
        modelsEndpoint: "https://api.stepfun.ai/v1/models",
        active: true,
    },
    {
        platformId: "suno",
        platformName: "Suno",
        providerIds: [],
        modelsEndpoint: null,
        active: false,
        reason: "No API models endpoint mapped yet.",
    },
    {
        platformId: "together",
        platformName: "Together",
        providerIds: ["together"],
        modelsEndpoint: "https://api.together.xyz/v1/models",
        active: true,
    },
    {
        platformId: "venice",
        platformName: "Venice",
        providerIds: ["venice"],
        modelsEndpoint: "https://api.venice.ai/api/v1/models",
        active: true,
    },
    {
        platformId: "weights-and-biases",
        platformName: "Weights & Biases",
        providerIds: ["weights-and-biases"],
        modelsEndpoint: "https://api.inference.wandb.ai/v1/models",
        active: true,
    },
    {
        platformId: "xai",
        platformName: "xAI",
        providerIds: ["x-ai"],
        modelsEndpoint: "https://api.x.ai/v1/models",
        active: true,
    },
    {
        platformId: "xiaomi",
        platformName: "Xiaomi",
        providerIds: ["xiaomi"],
        modelsEndpoint: "https://api.xiaomimimo.com/v1/models",
        active: true,
    },
    {
        platformId: "zai",
        platformName: "z.AI",
        providerIds: ["z-ai"],
        modelsEndpoint: "https://api.z.ai/api/paas/v4/models",
        active: true,
    },
];

const providerRuleById = new Map<string, ProviderDiscoveryRule>();
for (const platformRule of PLATFORM_DISCOVERY_RULES) {
    for (const providerId of platformRule.providerIds) {
        if (providerRuleById.has(providerId)) {
            throw new Error(`Duplicate provider discovery rule for provider id: ${providerId}`);
        }

        providerRuleById.set(providerId, {
            providerId,
            platformId: platformRule.platformId,
            platformName: platformRule.platformName,
            modelsEndpoint: platformRule.modelsEndpoint,
            active: platformRule.active,
            reason: platformRule.reason,
        });
    }
}

export const PROVIDER_DISCOVERY_RULES = providerRuleById;

export function getProviderDiscoveryRule(providerId: string): ProviderDiscoveryRule | undefined {
    return PROVIDER_DISCOVERY_RULES.get(providerId);
}
