// apps/api/src/runtime/env.ts
import type { Redis } from "@upstash/redis";
import { Redis as UpstashRedis } from "@upstash/redis/cloudflare";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export type GatewayBindings = {
    SUPABASE_URL: string;
    SUPABASE_SERVICE_ROLE_KEY: string;
    NEXT_PUBLIC_GATEWAY_VERSION?: string;
    AXIOM_API_KEY?: string;
    AXIOM_DATASET?: string;
    AXIOM_WIDE_DATASET?: string;
    OPENAI_API_KEY?: string;
    OPENAI_BASE_URL?: string;
    GOOGLE_AI_STUDIO_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    XAI_API_KEY?: string;
    AI21_API_KEY?: string;
    AI21_BASE_URL?: string;
    ALIBABA_API_KEY?: string;
    ALIBABA_BASE_URL?: string;
    ATLAS_CLOUD_API_KEY?: string;
    ATLAS_CLOUD_BASE_URL?: string;
    BASETEN_API_KEY?: string;
    BASETEN_BASE_URL?: string;
    CEREBRAS_API_KEY?: string;
    CEREBRAS_BASE_URL?: string;
    CHUTES_API_KEY?: string;
    CHUTES_BASE_URL?: string;
    COHERE_API_KEY?: string;
    COHERE_BASE_URL?: string;
    DEEPINFRA_API_KEY?: string;
    DEEPINFRA_BASE_URL?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_BASE_URL?: string;
    GROQ_API_KEY?: string;
    GROQ_BASE_URL?: string;
    MINIMAX_API_KEY?: string;
    MINIMAX_BASE_URL?: string;
    MISTRAL_API_KEY?: string;
    MISTRAL_BASE_URL?: string;
    MOONSHOT_API_KEY?: string;
    MOONSHOT_BASE_URL?: string;
    XIAOMI_MIMO_API_KEY?: string;
    XIAOMI_MIMO_BASE_URL?: string;
    NOVITA_API_KEY?: string;
    NOVITA_BASE_URL?: string;
    PARASAIL_API_KEY?: string;
    PARASAIL_BASE_URL?: string;
    QWEN_API_KEY?: string;
    QWEN_BASE_URL?: string;
    TOGETHER_API_KEY?: string;
    TOGETHER_BASE_URL?: string;
    AZURE_OPENAI_API_KEY?: string;
    AZURE_OPENAI_BASE_URL?: string;
    AZURE_OPENAI_API_VERSION?: string;
    KEY_PEPPER?: string;
    UPSTASH_REDIS_REST_URL: string;
    UPSTASH_REDIS_REST_TOKEN: string;
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
    redis: Redis;
    supabase: SupabaseClient;
};

const BINDING_KEYS: Array<keyof GatewayBindings> = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_GATEWAY_VERSION",
    "AXIOM_API_KEY",
    "AXIOM_DATASET",
    "AXIOM_WIDE_DATASET",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "GOOGLE_AI_STUDIO_API_KEY",
    "ANTHROPIC_API_KEY",
    "KEY_PEPPER",
    "XAI_API_KEY",
    "AI21_API_KEY",
    "AI21_BASE_URL",
    "ALIBABA_API_KEY",
    "ALIBABA_BASE_URL",
    "ATLAS_CLOUD_API_KEY",
    "ATLAS_CLOUD_BASE_URL",
    "BASETEN_API_KEY",
    "BASETEN_BASE_URL",
    "CEREBRAS_API_KEY",
    "CEREBRAS_BASE_URL",
    "CHUTES_API_KEY",
    "CHUTES_BASE_URL",
    "COHERE_API_KEY",
    "COHERE_BASE_URL",
    "DEEPINFRA_API_KEY",
    "DEEPINFRA_BASE_URL",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_BASE_URL",
    "GROQ_API_KEY",
    "GROQ_BASE_URL",
    "MINIMAX_API_KEY",
    "MINIMAX_BASE_URL",
    "MISTRAL_API_KEY",
    "MISTRAL_BASE_URL",
    "MOONSHOT_API_KEY",
    "MOONSHOT_BASE_URL",
    "XIAOMI_MIMO_API_KEY",
    "XIAOMI_MIMO_BASE_URL",
    "NOVITA_API_KEY",
    "NOVITA_BASE_URL",
    "PARASAIL_API_KEY",
    "PARASAIL_BASE_URL",
    "QWEN_API_KEY",
    "QWEN_BASE_URL",
    "TOGETHER_API_KEY",
    "TOGETHER_BASE_URL",
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_BASE_URL",
    "AZURE_OPENAI_API_VERSION",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
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
            snap[key] = typeof value === "string" ? `${value}` : value;
        }
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

    const redisClient = new UpstashRedis({
        url: bindings.UPSTASH_REDIS_REST_URL,
        token: bindings.UPSTASH_REDIS_REST_TOKEN,
    });

    const globalFetch: typeof fetch = (input, init) => fetch(input, init);

    const supabaseAdmin = createClient(bindings.SUPABASE_URL, bindings.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: globalFetch },
    });

    runtimeState = { bindings, redis: redisClient, supabase: supabaseAdmin };
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
        return () => {};
    }
    if (!lastBindingsSnapshot) {
        throw new Error("Gateway runtime not configured");
    }
    configureRuntime(lastBindingsSnapshot);
    return () => clearRuntime();
}

export function setWaitUntil(handler?: (promise: Promise<unknown>) => void): () => void {
    if (!handler) {
        return () => {};
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

export function getRedis(): Redis {
    return ensureRuntime().redis;
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

