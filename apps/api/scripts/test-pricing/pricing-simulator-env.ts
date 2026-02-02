import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configureRuntime, clearRuntime, type GatewayBindings } from "../../src/runtime/env";

export { clearRuntime };

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

export function loadEnvFromFiles(files: string[] = [".env.local", ".env", ".dev.vars"]): void {
    for (const file of files) {
        const fullPath = resolve(process.cwd(), file);
        if (!existsSync(fullPath)) continue;
        try {
            const contents = readFileSync(fullPath, "utf8");
            for (const rawLine of contents.split(/\r?\n/)) {
                const line = rawLine.trim();
                if (!line || line.startsWith("#")) continue;
                const eqIndex = line.indexOf("=");
                if (eqIndex === -1) continue;
                const key = line.slice(0, eqIndex).trim();
                if (!key) continue;
                if (process.env[key] !== undefined) continue;
                let value = line.slice(eqIndex + 1).trim();
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                process.env[key] = value;
            }
        } catch (err) {
            // eslint-disable-next-line no-console
            console.warn(`Failed to load env file ${file}:`, err);
        }
    }
}

export function ensureRuntimeConfigured(): void {
    loadEnvFromFiles();
    const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }

    const bindings: GatewayBindings = {
        SUPABASE_URL: process.env.SUPABASE_URL!,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
        GATEWAY_CACHE: createMemoryKv(),
        NEXT_PUBLIC_GATEWAY_VERSION: process.env.NEXT_PUBLIC_GATEWAY_VERSION ?? "cli-simulator",
        AXIOM_API_KEY: process.env.AXIOM_API_KEY,
        AXIOM_DATASET: process.env.AXIOM_DATASET,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        GOOGLE_AI_STUDIO_API_KEY: process.env.GOOGLE_AI_STUDIO_API_KEY,
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        XAI_API_KEY: process.env.XAI_API_KEY,
        KEY_PEPPER: process.env.KEY_PEPPER,
        NODE_ENV: process.env.NODE_ENV,
        BYOK_KMS_KEY_V1_B64: process.env.BYOK_KMS_KEY_V1_B64,
        BYOK_ACTIVE_KEY_VERSION: process.env.BYOK_ACTIVE_KEY_VERSION,
    };

    configureRuntime(bindings);
}
