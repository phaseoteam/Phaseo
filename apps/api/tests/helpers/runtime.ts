import { configureRuntime, clearRuntime, type GatewayBindings } from "@/runtime/env";

let configured = false;

export function setupTestRuntime() {
    if (configured) return;
    configured = true;
    configureRuntime({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
        OPENAI_API_KEY: "test-openai-key",
        GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
        ANTHROPIC_API_KEY: "test-anthropic-key",
        XAI_API_KEY: "test-xai-key",
        AI21_API_KEY: "test-ai21-key",
        AI21_BASE_URL: "https://api.ai21.example",
        ALIBABA_API_KEY: "test-alibaba-key",
        ALIBABA_BASE_URL: "https://api.alibaba.example",
        ATLAS_CLOUD_API_KEY: "test-atlas-key",
        ATLAS_CLOUD_BASE_URL: "https://api.atlas.example",
        BASETEN_API_KEY: "test-baseten-key",
        BASETEN_BASE_URL: "https://api.baseten.example",
        CEREBRAS_API_KEY: "test-cerebras-key",
        CEREBRAS_BASE_URL: "https://api.cerebras.example",
        CHUTES_API_KEY: "test-chutes-key",
        CHUTES_BASE_URL: "https://api.chutes.example",
        COHERE_API_KEY: "test-cohere-key",
        COHERE_BASE_URL: "https://api.cohere.example",
        DEEPINFRA_API_KEY: "test-deepinfra-key",
        DEEPINFRA_BASE_URL: "https://api.deepinfra.example",
        DEEPSEEK_API_KEY: "test-deepseek-key",
        DEEPSEEK_BASE_URL: "https://api.deepseek.example",
        GROQ_API_KEY: "test-groq-key",
        GROQ_BASE_URL: "https://api.groq.example",
        MINIMAX_API_KEY: "test-minimax-key",
        MINIMAX_BASE_URL: "https://api.minimax.example",
        MISTRAL_API_KEY: "test-mistral-key",
        MISTRAL_BASE_URL: "https://api.mistral.example",
        MOONSHOT_API_KEY: "test-moonshot-key",
        MOONSHOT_BASE_URL: "https://api.moonshot.example",
        XIAOMI_MIMO_API_KEY: "test-xiaomi-key",
        XIAOMI_MIMO_BASE_URL: "https://api.xiaomi.example",
        NOVITA_API_KEY: "test-novita-key",
        NOVITA_BASE_URL: "https://api.novita.example",
        PARASAIL_API_KEY: "test-parasail-key",
        PARASAIL_BASE_URL: "https://api.parasail.example",
        QWEN_API_KEY: "test-qwen-key",
        QWEN_BASE_URL: "https://api.qwen.example",
        TOGETHER_API_KEY: "test-together-key",
        TOGETHER_BASE_URL: "https://api.together.example",
        AZURE_OPENAI_API_KEY: "test-azure-key",
        AZURE_OPENAI_BASE_URL: "https://api.azure.example",
        AZURE_OPENAI_API_VERSION: "2024-06-01",
        FIREWORKS_API_KEY: "test-fireworks-key",
        FIREWORKS_BASE_URL: "https://api.fireworks.example",
        PERPLEXITY_API_KEY: "test-perplexity-key",
        PERPLEXITY_BASE_URL: "https://api.perplexity.example",
        LIQUID_API_KEY: "test-liquid-key",
        LIQUID_BASE_URL: "https://api.liquid.example",
        LIQUID_AI_API_KEY: "test-liquid-ai-key",
        LIQUID_AI_BASE_URL: "https://api.liquid-ai.example",
        NEBIUS_API_KEY: "test-nebius-key",
        NEBIUS_BASE_URL: "https://api.nebius.example",
        SOURCEFUL_API_KEY: "test-sourceful-key",
        SOURCEFUL_BASE_URL: "https://api.sourceful.example",
        RELACE_API_KEY: "test-relace-key",
        RELACE_BASE_URL: "https://api.relace.example",
        AION_LABS_API_KEY: "test-aionlabs-key",
        AION_LABS_BASE_URL: "https://api.aionlabs.example",
        NODE_ENV: "test",
    } as any);
}

export function setupRuntimeFromEnv(env: Partial<GatewayBindings>) {
    configureRuntime({
        SUPABASE_URL: env.SUPABASE_URL ?? "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key",
        UPSTASH_REDIS_REST_URL: env.UPSTASH_REDIS_REST_URL ?? "https://example.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: env.UPSTASH_REDIS_REST_TOKEN ?? "test-upstash-token",
        OPENAI_API_KEY: env.OPENAI_API_KEY,
        OPENAI_BASE_URL: env.OPENAI_BASE_URL,
        NODE_ENV: env.NODE_ENV ?? "test",
    } as GatewayBindings);
}

export function teardownTestRuntime() {
    if (!configured) return;
    configured = false;
    clearRuntime();
}
