// Purpose: Runtime bindings and environment helpers.
// Why: Centralizes platform configuration.
// How: Reads bindings and exposes initialized clients.

// apps/api/src/runtime/env.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export type GatewayBindings = {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    GATEWAY_CACHE: KVNamespace;
    KV?: KVNamespace;
    DB?: D1Database;
    GATEWAY_CONTROL_SECRET?: string;
    NEXT_PUBLIC_GATEWAY_VERSION?: string;
    AXIOM_API_KEY?: string;
    AXIOM_DATASET?: string;
    AXIOM_WIDE_DATASET?: string;
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    GOOGLE_AI_STUDIO_API_KEY?: string;
    GOOGLE_AI_STUDIO_BASE_URL?: string;
    GOOGLE_API_KEY?: string;
    GOOGLE_BASE_URL?: string;
    ANTHROPIC_API_KEY?: string;
    X_AI_API_KEY?: string;
    XAI_API_KEY?: string;
    XAI_BASE_URL?: string;
    XAI_DEBUG_USAGE?: string;
    AI21_API_KEY?: string;
    AI21_BASE_URL?: string;
    ALIBABA_API_KEY?: string;
    ALIBABA_BASE_URL?: string;
    AMAZON_BEDROCK_API_KEY?: string;
    AMAZON_BEDROCK_BASE_URL?: string;
    AMAZON_BEDROCK_REGION?: string;
    AWS_ACCESS_KEY_ID?: string;
    AWS_SECRET_ACCESS_KEY?: string;
    AWS_SESSION_TOKEN?: string;
    AWS_REGION?: string;
    ARCEE_API_KEY?: string;
    ARCEE_BASE_URL?: string;
    ATLAS_CLOUD_API_KEY?: string;
    ATLAS_CLOUD_BASE_URL?: string;
    BASETEN_API_KEY?: string;
    BASETEN_BASE_URL?: string;
    BYTEDANCE_SEED_API_KEY?: string;
    BYTEDANCE_SEED_BASE_URL?: string;
    CEREBRAS_API_KEY?: string;
    CEREBRAS_BASE_URL?: string;
    CHUTES_API_KEY?: string;
    CHUTES_BASE_URL?: string;
    CLARIFAI_PAT?: string;
    CLARIFAI_BASE_URL?: string;
    CLOUDFLARE_API_TOKEN?: string;
    CLOUDFLARE_AI_GATEWAY_BASE_URL?: string;
    COHERE_API_KEY?: string;
    COHERE_BASE_URL?: string;
    CRUSOE_API_KEY?: string;
    CRUSOE_BASE_URL?: string;
    DEEPINFRA_API_KEY?: string;
    DEEPINFRA_BASE_URL?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_BASE_URL?: string;
    FEATHERLESS_API_KEY?: string;
    FEATHERLESS_BASE_URL?: string;
    FIREWORKS_API_KEY?: string;
    FIREWORKS_BASE_URL?: string;
    FRIENDLI_TOKEN?: string;
    FRIENDLI_BASE_URL?: string;
    GMI_API_KEY?: string;
    GMI_BASE_URL?: string;
    GROQ_API_KEY?: string;
    GROQ_BASE_URL?: string;
    GOOGLE_VERTEX_API_KEY?: string;
    GOOGLE_VERTEX_BASE_URL?: string;
    GOOGLE_VERTEX_ACCESS_TOKEN?: string;
    GOOGLE_VERTEX_PROJECT?: string;
    GOOGLE_VERTEX_LOCATION?: string;
    HYPERBOLIC_API_KEY?: string;
    HYPERBOLIC_BASE_URL?: string;
    INCEPTION_API_KEY?: string;
    INCEPTION_BASE_URL?: string;
    INFERMATIC_API_KEY?: string;
    INFERMATIC_BASE_URL?: string;
    INFLECTION_API_KEY?: string;
    INFLECTION_BASE_URL?: string;
    LIQUID_API_KEY?: string;
    LIQUID_BASE_URL?: string;
    LIQUID_AI_API_KEY?: string;
    LIQUID_AI_BASE_URL?: string;
    MANCER_API_KEY?: string;
    MANCER_BASE_URL?: string;
    MINIMAX_API_KEY?: string;
    MINIMAX_BASE_URL?: string;
    MISTRAL_API_KEY?: string;
    MISTRAL_AI_API_KEY?: string;
    MISTRAL_BASE_URL?: string;
    ELEVENLABS_API_KEY?: string;
    ELEVENLABS_BASE_URL?: string;
    SUNO_API_KEY?: string;
    SUNO_BASE_URL?: string;
    MOONSHOT_AI_API_KEY?: string;
    MOONSHOT_AI_BASE_URL?: string;
    MORPH_API_KEY?: string;
    MORPH_BASE_URL?: string;
    MORPHEUS_API_KEY?: string;
    MORPHEUS_BASE_URL?: string;
    NEBIUS_API_KEY?: string;
    NEBIUS_BASE_URL?: string;
    XIAOMI_MIMO_API_KEY?: string;
    XIAOMI_MIMO_BASE_URL?: string;
    NOVITA_API_KEY?: string;
    NOVITA_BASE_URL?: string;
    PARASAIL_API_KEY?: string;
    PARASAIL_BASE_URL?: string;
    PERPLEXITY_API_KEY?: string;
    PERPLEXITY_BASE_URL?: string;
    PHALA_API_KEY?: string;
    PHALA_BASE_URL?: string;
    QWEN_API_KEY?: string;
    QWEN_BASE_URL?: string;
    RELACE_API_KEY?: string;
    RELACE_BASE_URL?: string;
    SAMBANOVA_API_KEY?: string;
    SAMBANOVA_BASE_URL?: string;
    SILICONFLOW_API_KEY?: string;
    SILICONFLOW_BASE_URL?: string;
    SOURCEFUL_API_KEY?: string;
    SOURCEFUL_BASE_URL?: string;
    TOGETHER_API_KEY?: string;
    TOGETHER_BASE_URL?: string;
    WANDB_API_KEY?: string;
    WANDB_BASE_URL?: string;
    AION_LABS_API_KEY?: string;
    AION_LABS_BASE_URL?: string;
    ZAI_API_KEY?: string;
    ZAI_BASE_URL?: string;
    AZURE_OPENAI_API_KEY?: string;
    AZURE_OPENAI_BASE_URL?: string;
    AZURE_OPENAI_API_VERSION?: string;
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    RESEND_TEMPLATE_WELCOME_ID?: string;
    RESEND_TEMPLATE_LOW_BALANCE_ID?: string;
    KEY_PEPPER?: string;
    NODE_ENV?: string;
    BYOK_KMS_KEY_V1_B64?: string;
    BYOK_ACTIVE_KEY_VERSION?: string;
};

export type GatewayRuntime = {
    bindings: GatewayBindings;
    waitUntil?: (promise: Promise<unknown>) => void;
};

type RuntimeState = {
    bindings: GatewayBindings;
    cache: KVNamespace;
    supabase: SupabaseClient;
};

const BINDING_KEYS: Array<keyof GatewayBindings> = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GATEWAY_CACHE",
    "GATEWAY_CONTROL_SECRET",
    "NEXT_PUBLIC_GATEWAY_VERSION",
    "AXIOM_API_KEY",
    "AXIOM_DATASET",
    "AXIOM_WIDE_DATASET",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "GOOGLE_AI_STUDIO_API_KEY",
    "GOOGLE_AI_STUDIO_BASE_URL",
    "GOOGLE_API_KEY",
    "GOOGLE_BASE_URL",
    "ANTHROPIC_API_KEY",
    "KEY_PEPPER",
    "X_AI_API_KEY",
    "XAI_API_KEY",
    "XAI_BASE_URL",
    "XAI_DEBUG_USAGE",
    "AI21_API_KEY",
    "AI21_BASE_URL",
    "ALIBABA_API_KEY",
    "ALIBABA_BASE_URL",
    "AMAZON_BEDROCK_API_KEY",
    "AMAZON_BEDROCK_BASE_URL",
    "AMAZON_BEDROCK_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_REGION",
    "ARCEE_API_KEY",
    "ARCEE_BASE_URL",
    "ATLAS_CLOUD_API_KEY",
    "ATLAS_CLOUD_BASE_URL",
    "BASETEN_API_KEY",
    "BASETEN_BASE_URL",
    "BYTEDANCE_SEED_API_KEY",
    "BYTEDANCE_SEED_BASE_URL",
    "CEREBRAS_API_KEY",
    "CEREBRAS_BASE_URL",
    "CHUTES_API_KEY",
    "CHUTES_BASE_URL",
    "CLARIFAI_PAT",
    "CLARIFAI_BASE_URL",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_AI_GATEWAY_BASE_URL",
    "COHERE_API_KEY",
    "COHERE_BASE_URL",
    "CRUSOE_API_KEY",
    "CRUSOE_BASE_URL",
    "DEEPINFRA_API_KEY",
    "DEEPINFRA_BASE_URL",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "FEATHERLESS_API_KEY",
    "FEATHERLESS_BASE_URL",
    "FIREWORKS_API_KEY",
    "FIREWORKS_BASE_URL",
    "FRIENDLI_TOKEN",
    "FRIENDLI_BASE_URL",
    "GMI_API_KEY",
    "GMI_BASE_URL",
    "GROQ_API_KEY",
    "GROQ_BASE_URL",
    "GOOGLE_VERTEX_API_KEY",
    "GOOGLE_VERTEX_BASE_URL",
    "GOOGLE_VERTEX_ACCESS_TOKEN",
    "GOOGLE_VERTEX_PROJECT",
    "GOOGLE_VERTEX_LOCATION",
    "HYPERBOLIC_API_KEY",
    "HYPERBOLIC_BASE_URL",
    "INCEPTION_API_KEY",
    "INCEPTION_BASE_URL",
    "INFERMATIC_API_KEY",
    "INFERMATIC_BASE_URL",
    "INFLECTION_API_KEY",
    "INFLECTION_BASE_URL",
    "LIQUID_API_KEY",
    "LIQUID_BASE_URL",
    "LIQUID_AI_API_KEY",
    "LIQUID_AI_BASE_URL",
    "MANCER_API_KEY",
    "MANCER_BASE_URL",
    "MINIMAX_API_KEY",
    "MINIMAX_BASE_URL",
    "MISTRAL_API_KEY",
    "MISTRAL_AI_API_KEY",
    "MISTRAL_BASE_URL",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_BASE_URL",
    "SUNO_API_KEY",
    "SUNO_BASE_URL",
    "MOONSHOT_AI_API_KEY",
    "MOONSHOT_AI_BASE_URL",
    "MORPH_API_KEY",
    "MORPH_BASE_URL",
    "MORPHEUS_API_KEY",
    "MORPHEUS_BASE_URL",
    "NEBIUS_API_KEY",
    "NEBIUS_BASE_URL",
    "XIAOMI_MIMO_API_KEY",
    "XIAOMI_MIMO_BASE_URL",
    "NOVITA_API_KEY",
    "NOVITA_BASE_URL",
    "PARASAIL_API_KEY",
    "PARASAIL_BASE_URL",
    "PERPLEXITY_API_KEY",
    "PERPLEXITY_BASE_URL",
    "PHALA_API_KEY",
    "PHALA_BASE_URL",
    "QWEN_API_KEY",
    "QWEN_BASE_URL",
    "RELACE_API_KEY",
    "RELACE_BASE_URL",
    "SAMBANOVA_API_KEY",
    "SAMBANOVA_BASE_URL",
    "SILICONFLOW_API_KEY",
    "SILICONFLOW_BASE_URL",
    "SOURCEFUL_API_KEY",
    "SOURCEFUL_BASE_URL",
    "TOGETHER_API_KEY",
    "TOGETHER_BASE_URL",
    "WANDB_API_KEY",
    "WANDB_BASE_URL",
    "AION_LABS_API_KEY",
    "AION_LABS_BASE_URL",
    "ZAI_API_KEY",
    "ZAI_BASE_URL",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_API_VERSION",
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "RESEND_TEMPLATE_WELCOME_ID",
    "RESEND_TEMPLATE_LOW_BALANCE_ID",
    "NODE_ENV",
    "BYOK_KMS_KEY_V1_B64",
    "BYOK_ACTIVE_KEY_VERSION",
];

let runtimeState: RuntimeState | null = null;
let runtimeActiveCount = 0;
let lastBindingsSnapshot: GatewayBindings | null = null;
type WaitUntilEntry = {
    id: number;
    handler: (promise: Promise<unknown>) => void;
};
const waitUntilEntries: WaitUntilEntry[] = [];
let nextWaitUntilEntryId = 0;
let waitUntilHandler: ((promise: Promise<unknown>) => void) | null = null;

function snapshotBindings(env: GatewayBindings): GatewayBindings {
    const snap: Partial<GatewayBindings> = {};
    for (const key of BINDING_KEYS) {
        const value = env[key];
        if (value !== undefined) {
            // Ensure we only retain primitive copies (avoid accidental mutation)
            const nextValue = typeof value === "string" ? `${value}` : value;
            (snap as Record<string, unknown>)[key] = nextValue;
        }
    }

    // Backward-compatible aliases used across scripts/docs/tests.
    if (!snap.X_AI_API_KEY && env.XAI_API_KEY) {
        snap.X_AI_API_KEY = `${env.XAI_API_KEY}`;
    }
    if (!snap.XAI_API_KEY && env.X_AI_API_KEY) {
        snap.XAI_API_KEY = `${env.X_AI_API_KEY}`;
    }
    if (!snap.KV && env.GATEWAY_CACHE) {
        snap.KV = env.GATEWAY_CACHE;
    }
    if (!snap.MISTRAL_API_KEY && env.MISTRAL_AI_API_KEY) {
        snap.MISTRAL_API_KEY = `${env.MISTRAL_AI_API_KEY}`;
    }
    return Object.freeze(snap) as GatewayBindings;
}

function ensureRuntime(): RuntimeState {
    if (!runtimeState) throw new Error("Gateway runtime not configured");
    return runtimeState;
}

export function configureRuntime(env: GatewayBindings) {
    runtimeActiveCount += 1;
    if (runtimeState) return;

    const bindings = snapshotBindings(env);
    lastBindingsSnapshot = bindings;

    const globalFetch: typeof fetch = (input, init) => fetch(input, init);

    const supabaseAdmin = createClient(bindings.SUPABASE_URL, bindings.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: globalFetch },
    });

    runtimeState = { bindings, cache: bindings.GATEWAY_CACHE, supabase: supabaseAdmin };
}

export function clearRuntime() {
    if (runtimeActiveCount > 0) {
        runtimeActiveCount -= 1;
    }

    if (runtimeActiveCount === 0) {
        runtimeState = null;
        waitUntilEntries.length = 0;
        waitUntilHandler = null;
    }
}

export function ensureRuntimeForBackground(): () => void {
    if (runtimeState) {
        return () => { };
    }
    if (!lastBindingsSnapshot) {
        throw new Error("Gateway runtime not configured");
    }
    configureRuntime(lastBindingsSnapshot);
    return () => clearRuntime();
}

export function setWaitUntil(handler?: (promise: Promise<unknown>) => void): () => void {
    if (!handler) {
        return () => { };
    }

    const entry: WaitUntilEntry = {
        id: ++nextWaitUntilEntryId,
        handler,
    };
    waitUntilEntries.push(entry);
    waitUntilHandler = handler;

    let released = false;
    return () => {
        if (released) return;
        released = true;
        const idx = waitUntilEntries.findIndex((item) => item.id === entry.id);
        if (idx !== -1) {
            waitUntilEntries.splice(idx, 1);
        }
        waitUntilHandler = waitUntilEntries.length ? waitUntilEntries[waitUntilEntries.length - 1].handler : null;
    };
}

export function getBindings(): GatewayBindings {
    return ensureRuntime().bindings;
}

export function dispatchBackground(promise: Promise<unknown>) {
    const handler = waitUntilHandler;
    if (handler) {
        handler(promise.catch((err) => console.error(err)));
        return;
    }
    promise.catch((err) => console.error(err));
}

export function getCache(): KVNamespace {
    return ensureRuntime().cache;
}

export function getSupabaseAdmin(): SupabaseClient {
    return ensureRuntime().supabase;
}

export function getByokKey(version: number): string {
    const bindings = getBindings();
    const raw =
        (bindings as any)[`BYOK_KMS_KEY_V${version}_B64`] ??
        (bindings as any)[`BYOK_KMS_KEY_V${version}`];

    if (!raw) throw new Error(`Missing BYOK key for version ${version}`);

    const s = String(raw).trim().replace(/^["']|["']$/g, "");
    return s.startsWith("base64:") ? s.slice(7) : s;
}

