import { configureRuntime, clearRuntime, type GatewayBindings } from "@/runtime/env";

function createMemoryKv(): KVNamespace {
    const store = new Map<string, { value: string; expiresAt?: number }>();

    function isExpired(entry: { value: string; expiresAt?: number } | undefined): boolean {
        if (!entry) return true;
        if (!entry.expiresAt) return false;
        return Date.now() >= entry.expiresAt;
    }

    return {
        async get(key: string, type?: "text" | "json" | "arrayBuffer" | "stream") {
            const entry = store.get(key);
            if (isExpired(entry)) {
                store.delete(key);
                return null;
            }
            if (!entry) return null;
            if (!type || type === "text") return entry.value;
            if (type === "json") return JSON.parse(entry.value);
            if (type === "arrayBuffer") return new TextEncoder().encode(entry.value).buffer;
            if (type === "stream") return new Response(entry.value).body;
            return entry.value;
        },
        async put(key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: KVNamespacePutOptions) {
            let textValue = "";
            if (typeof value === "string") textValue = value;
            else if (value instanceof ArrayBuffer) textValue = new TextDecoder().decode(value);
            else if (ArrayBuffer.isView(value)) textValue = new TextDecoder().decode(value.buffer);
            else {
                const response = new Response(value);
                textValue = await response.text();
            }
            const ttl = options?.expirationTtl;
            store.set(key, {
                value: textValue,
                expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
            });
        },
        async delete(key: string) {
            store.delete(key);
        },
    } as KVNamespace;
}

let configured = false;

export function setupTestRuntime() {
    if (configured) return;
    configured = true;
    configureRuntime({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
        GATEWAY_CACHE: createMemoryKv(),
        OPENAI_API_KEY: "test-openai-key",
        GOOGLE_AI_STUDIO_API_KEY: "test-google-key",
        GOOGLE_AI_STUDIO_BASE_URL: "https://api.google-ai-studio.example",
        GOOGLE_API_KEY: "test-google-key",
        GOOGLE_BASE_URL: "https://api.google.example",
        ANTHROPIC_API_KEY: "test-anthropic-key",
        XAI_API_KEY: "test-xai-key",
        AI21_API_KEY: "test-ai21-key",
        AI21_BASE_URL: "https://api.ai21.example",
        ALIBABA_API_KEY: "test-alibaba-key",
        ALIBABA_BASE_URL: "https://api.alibaba.example",
        AMAZON_BEDROCK_API_KEY: "test-bedrock-key",
        AMAZON_BEDROCK_BASE_URL: "https://api.bedrock.example",
        ARCEE_API_KEY: "test-arcee-key",
        ARCEE_BASE_URL: "https://api.arcee.example",
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
        GOOGLE_VERTEX_API_KEY: "test-vertex-key",
        GOOGLE_VERTEX_BASE_URL: "https://api.vertex.example",
        GOOGLE_VERTEX_PROJECT: "test-project",
        GOOGLE_VERTEX_LOCATION: "us-east5",
        MINIMAX_API_KEY: "test-minimax-key",
        MINIMAX_BASE_URL: "https://api.minimax.example",
        ZAI_API_KEY: "test-zai-key",
        ZAI_BASE_URL: "https://api.zai.example",
        MISTRAL_API_KEY: "test-mistral-key",
        MISTRAL_BASE_URL: "https://api.mistral.example",
        ELEVENLABS_API_KEY: "test-elevenlabs-key",
        ELEVENLABS_BASE_URL: "https://api.elevenlabs.example",
        SUNO_API_KEY: "test-suno-key",
        SUNO_BASE_URL: "https://api.suno.example",
        MOONSHOT_AI_API_KEY: "test-moonshot-key",
        MOONSHOT_AI_BASE_URL: "https://api.moonshot.example",
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
        GATEWAY_CACHE: env.GATEWAY_CACHE ?? createMemoryKv(),
        NODE_ENV: env.NODE_ENV ?? "test",
        ...env,
    } as GatewayBindings);
    configured = true;
}

export function teardownTestRuntime() {
    if (!configured) return;
    configured = false;
    clearRuntime();
}
