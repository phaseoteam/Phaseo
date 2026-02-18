import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

type CliArgs = {
    providers: string[];
    scenarios: string[];
    modelOverrides: string[];
    gatewayUrl?: string;
    apiKey?: string;
    maxOutputTokens?: string;
    includeTuning?: string;
    requireUsage?: string;
    requireUsageNonzero?: string;
    allowTransientFailures?: string;
    allProviders: boolean;
    allApiProviders: boolean;
    vitestArgs: string[];
    help: boolean;
};

type ModelsResponse = {
    total?: number;
    models?: Array<{
        endpoints?: string[];
        providers?: Array<{
            api_provider_id?: string;
            endpoint?: string;
            is_active_gateway?: boolean;
        }>;
    }>;
};

type ProviderModelRow = {
    provider_api_model_id?: string | null;
    provider_id?: string | null;
    is_active_gateway?: boolean | null;
    effective_from?: string | null;
    effective_to?: string | null;
};

type ProviderCapabilityRow = {
    provider_api_model_id?: string | null;
};

type ProvidersResponse = {
    total?: number;
    providers?: Array<{
        api_provider_id?: string;
    }>;
};

type SupabaseProviderRow = {
    api_provider_id?: string | null;
};

const PROVIDER_ALIASES: Record<string, string> = {
    arcee: "arcee-ai",
    "arcee-ai": "arcee-ai",
    xai: "x-ai",
    "x-ai": "x-ai",
};

function parseCsv(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function normalizeProviderId(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return "";
    return PROVIDER_ALIASES[normalized] ?? normalized;
}

function normalizeProviderList(values: string[]): string[] {
    return [...new Set(values.map(normalizeProviderId).filter(Boolean))];
}

function normalizeModelOverrides(values: string[]): string[] {
    const out = new Map<string, string>();
    for (const entry of values) {
        const split = entry.indexOf("=");
        if (split <= 0) continue;
        const provider = normalizeProviderId(entry.slice(0, split));
        const model = entry.slice(split + 1).trim();
        if (!provider || !model) continue;
        out.set(provider, `${provider}=${model}`);
    }
    return [...out.values()];
}

function parseBooleanEnv(value: string | undefined): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true") return "1";
    if (normalized === "0" || normalized === "false") return "0";
    return undefined;
}

function normalizeEnvValue(value: string | undefined): string {
    if (!value) return "";
    return value.trim().replace(/^['"]|['"]$/g, "");
}

function looksLikeGatewayAuthToken(token: string): boolean {
    if (!token) return false;
    if (token.startsWith("aistats_v1_sk_")) return true;
    // OAuth JWT path is also accepted by gateway auth.
    return token.split(".").length === 3;
}

function redactSensitiveText(input: string): string {
    return input
        .replace(/aistats_v1_sk_[A-Za-z0-9_-]+_[A-Za-z0-9._~-]+/g, "aistats_v1_sk_[REDACTED]")
        .replace(/Bearer\s+[A-Za-z0-9._~+\-/=]+/gi, "Bearer [REDACTED]")
        .replace(/\bsk-[A-Za-z0-9._~-]+\b/g, "sk-[REDACTED]");
}

function resolveGatewayApiKey(argsKey?: string): {
    key: string;
    source: string;
    derivedFromPlayground: boolean;
} {
    const cli = normalizeEnvValue(argsKey);
    if (cli) {
        return { key: cli, source: "--api-key", derivedFromPlayground: false };
    }

    const direct = normalizeEnvValue(process.env.GATEWAY_API_KEY);
    if (direct) {
        return { key: direct, source: "GATEWAY_API_KEY", derivedFromPlayground: false };
    }

    const explicitGateway = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY);
    if (explicitGateway) {
        return {
            key: explicitGateway,
            source: "PLAYGROUND_GATEWAY_KEY",
            derivedFromPlayground: false,
        };
    }

    const playgroundSecret = normalizeEnvValue(process.env.PLAYGROUND_KEY);
    const playgroundKid = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY_KID);
    if (!playgroundSecret) {
        return { key: "", source: "", derivedFromPlayground: false };
    }

    if (looksLikeGatewayAuthToken(playgroundSecret)) {
        return {
            key: playgroundSecret,
            source: "PLAYGROUND_KEY",
            derivedFromPlayground: false,
        };
    }

    if (playgroundKid) {
        return {
            key: `aistats_v1_sk_${playgroundKid}_${playgroundSecret}`,
            source: "PLAYGROUND_KEY+PLAYGROUND_GATEWAY_KEY_KID",
            derivedFromPlayground: true,
        };
    }

    return {
        key: playgroundSecret,
        source: "PLAYGROUND_KEY",
        derivedFromPlayground: false,
    };
}

function sanitizeEnvForSpawn(input: NodeJS.ProcessEnv): {
    env: NodeJS.ProcessEnv;
    droppedKeys: string[];
} {
    const out: NodeJS.ProcessEnv = {};
    const droppedKeys: string[] = [];
    for (const [key, value] of Object.entries(input)) {
        if (typeof value !== "string") continue;
        if (value.includes("\u0000")) {
            droppedKeys.push(key);
            continue;
        }
        out[key] = value;
    }
    return { env: out, droppedKeys };
}

function loadLocalEnv(apiRoot: string) {
    const envPaths = [
        path.join(apiRoot, ".dev.vars"),
        path.join(apiRoot, ".env.local"),
        path.join(apiRoot, ".env"),
    ];
    for (const envPath of envPaths) {
        if (!fs.existsSync(envPath)) continue;
        dotenvConfig({ path: envPath, override: false });
    }
}

function parseArgs(argv: string[]): CliArgs {
    const out: CliArgs = {
        providers: [],
        scenarios: [],
        modelOverrides: [],
        allProviders: false,
        allApiProviders: false,
        vitestArgs: [],
        help: false,
    };

    const passthroughIndex = argv.indexOf("--");
    const args = passthroughIndex >= 0 ? argv.slice(0, passthroughIndex) : argv;
    out.vitestArgs = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : [];

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (!arg) continue;
        const readValue = () => args[++i];
        const readInline = (prefix: string) => arg.slice(prefix.length);

        if (arg === "--help" || arg === "-h") {
            out.help = true;
            continue;
        }
        if (arg === "--all-providers") {
            out.allProviders = true;
            continue;
        }
        if (arg === "--all-api-providers") {
            out.allApiProviders = true;
            continue;
        }
        if (arg === "--provider") {
            out.providers.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--provider=")) {
            out.providers.push(...parseCsv(readInline("--provider=")));
            continue;
        }
        if (arg === "--providers") {
            out.providers.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--providers=")) {
            out.providers.push(...parseCsv(readInline("--providers=")));
            continue;
        }
        if (arg === "--scenario") {
            out.scenarios.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--scenario=")) {
            out.scenarios.push(...parseCsv(readInline("--scenario=")));
            continue;
        }
        if (arg === "--scenarios") {
            out.scenarios.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--scenarios=")) {
            out.scenarios.push(...parseCsv(readInline("--scenarios=")));
            continue;
        }
        if (arg === "--model-override") {
            const value = readValue();
            if (value) out.modelOverrides.push(value);
            continue;
        }
        if (arg.startsWith("--model-override=")) {
            const value = readInline("--model-override=");
            if (value) out.modelOverrides.push(value);
            continue;
        }
        if (arg === "--gateway-url") {
            out.gatewayUrl = readValue();
            continue;
        }
        if (arg.startsWith("--gateway-url=")) {
            out.gatewayUrl = readInline("--gateway-url=");
            continue;
        }
        if (arg === "--api-key") {
            out.apiKey = readValue();
            continue;
        }
        if (arg.startsWith("--api-key=")) {
            out.apiKey = readInline("--api-key=");
            continue;
        }
        if (arg === "--max-output-tokens") {
            out.maxOutputTokens = readValue();
            continue;
        }
        if (arg.startsWith("--max-output-tokens=")) {
            out.maxOutputTokens = readInline("--max-output-tokens=");
            continue;
        }
        if (arg === "--include-tuning") {
            out.includeTuning = "1";
            continue;
        }
        if (arg.startsWith("--include-tuning=")) {
            out.includeTuning = parseBooleanEnv(readInline("--include-tuning="));
            continue;
        }
        if (arg === "--require-usage") {
            out.requireUsage = "1";
            continue;
        }
        if (arg.startsWith("--require-usage=")) {
            out.requireUsage = parseBooleanEnv(readInline("--require-usage="));
            continue;
        }
        if (arg === "--require-usage-nonzero") {
            out.requireUsageNonzero = "1";
            continue;
        }
        if (arg.startsWith("--require-usage-nonzero=")) {
            out.requireUsageNonzero = parseBooleanEnv(readInline("--require-usage-nonzero="));
            continue;
        }
        if (arg === "--allow-transient-failures") {
            out.allowTransientFailures = "1";
            continue;
        }
        if (arg.startsWith("--allow-transient-failures=")) {
            out.allowTransientFailures = parseBooleanEnv(readInline("--allow-transient-failures="));
            continue;
        }
    }

    out.providers = normalizeProviderList(out.providers);
    out.scenarios = [...new Set(out.scenarios)];
    out.modelOverrides = normalizeModelOverrides(out.modelOverrides);
    return out;
}

function normalizeGatewayUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "http://127.0.0.1:8787/v1";
    if (trimmed.endsWith("/v1")) return trimmed;
    if (trimmed.endsWith("/v1/")) return trimmed.slice(0, -1);
    if (trimmed.endsWith("/")) return `${trimmed}v1`;
    return `${trimmed}/v1`;
}

function printUsage() {
    console.log("Run live text-provider tests from active-providers.live.spec.ts");
    console.log("");
    console.log("Usage:");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --provider openai");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --providers openai,anthropic");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --all-providers");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --all-api-providers");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --provider x-ai --scenario chat_stream_hi");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --provider baseten");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --provider cohere --scenarios chat_nonstream_hi,chat_stream_hi,chat_nonstream_tool,chat_nonstream_structured,messages_nonstream_hi,messages_nonstream_tool,messages_nonstream_structured");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --provider together --scenarios chat_nonstream_hi,chat_stream_hi,chat_nonstream_tool,chat_nonstream_structured,messages_nonstream_hi,messages_nonstream_tool,messages_nonstream_structured");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --providers arcee,deepinfra,together");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider -- --provider arcee --model-override arcee=arcee-ai/trinity-mini");
    console.log("");
    console.log("Flags:");
    console.log("  --provider <id>               Provider ID (repeatable or comma-separated)");
    console.log("  --providers <csv>             Provider IDs as CSV");
    console.log("  --all-providers               Discover all active text.generate providers from /v1/api/models");
    console.log("  --all-api-providers           Discover all API providers from /v1/providers");
    console.log("  --scenario <id>               Scenario ID (repeatable or comma-separated)");
    console.log("  --scenarios <csv>             Scenario IDs as CSV");
    console.log("  --model-override p=model      Override model selection for a provider (repeatable)");
    console.log("  --gateway-url <url>           Gateway base URL (defaults to http://127.0.0.1:8787/v1)");
    console.log("  --api-key <key>               Gateway API key (or set GATEWAY_API_KEY env)");
    console.log("  --max-output-tokens <n>       Sets LIVE_MAX_OUTPUT_TOKENS");
    console.log("  --include-tuning[=true|false] Sets LIVE_INCLUDE_TUNING");
    console.log("  --require-usage[=true|false]  Sets LIVE_REQUIRE_USAGE");
    console.log("  --require-usage-nonzero[=true|false] Sets LIVE_REQUIRE_USAGE_NONZERO");
    console.log("  --allow-transient-failures[=true|false] Sets LIVE_ALLOW_TRANSIENT_FAILURES (default: false)");
    console.log("  --                            Pass remaining args through to vitest");
}

function resolveGatewayModelsUrl(base: string): string {
    const gatewayUrl = normalizeGatewayUrl(base);
    const normalized = gatewayUrl.endsWith("/") ? gatewayUrl.slice(0, -1) : gatewayUrl;
    return `${normalized}/api/models`;
}

function resolveGatewayProvidersUrl(base: string): string {
    const gatewayUrl = normalizeGatewayUrl(base);
    const normalized = gatewayUrl.endsWith("/") ? gatewayUrl.slice(0, -1) : gatewayUrl;
    return `${normalized}/providers`;
}

function timestampStamp(): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(now.getUTCDate()).padStart(2, "0");
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const min = String(now.getUTCMinutes()).padStart(2, "0");
    const ss = String(now.getUTCSeconds()).padStart(2, "0");
    return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

async function discoverAllTextProviders(gatewayUrl: string, apiKey: string): Promise<string[]> {
    const providers = new Set<string>();
    const baseUrl = resolveGatewayModelsUrl(gatewayUrl);
    let offset = 0;
    const limit = 250;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const url = new URL(baseUrl);
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("limit", String(limit));

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        const payload = await response.json() as ModelsResponse;
        if (!response.ok) {
            throw new Error(`Failed to discover providers from /v1/api/models (${response.status}): ${JSON.stringify(payload)}`);
        }

        const models = payload.models ?? [];
        for (const model of models) {
            const modelEndpoints = Array.isArray(model.endpoints)
                ? model.endpoints.map((endpoint) => String(endpoint))
                : [];
            const modelSupportsText = modelEndpoints.includes("text.generate");
            for (const provider of model.providers ?? []) {
                const providerSupportsText = provider.endpoint
                    ? provider.endpoint === "text.generate"
                    : modelSupportsText;
                if (!providerSupportsText) continue;
                if (provider.is_active_gateway === false) continue;
                if (!provider.api_provider_id) continue;
                providers.add(provider.api_provider_id);
            }
        }

        total = typeof payload.total === "number" ? payload.total : models.length;
        offset += limit;
        if (!models.length) break;
    }

    return [...providers].sort((a, b) => a.localeCompare(b));
}

async function discoverAllApiProviders(gatewayUrl: string, apiKey: string): Promise<string[]> {
    const providers = new Set<string>();
    const baseUrl = resolveGatewayProvidersUrl(gatewayUrl);
    let offset = 0;
    const limit = 250;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const url = new URL(baseUrl);
        url.searchParams.set("offset", String(offset));
        url.searchParams.set("limit", String(limit));

        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        const payload = await response.json() as ProvidersResponse;
        if (!response.ok) {
            throw new Error(`Failed to discover providers from /v1/providers (${response.status}): ${JSON.stringify(payload)}`);
        }

        const rows = payload.providers ?? [];
        for (const row of rows) {
            if (!row.api_provider_id) continue;
            providers.add(row.api_provider_id);
        }

        total = typeof payload.total === "number" ? payload.total : rows.length;
        offset += limit;
        if (!rows.length) break;
    }

    return [...providers].sort((a, b) => a.localeCompare(b));
}

async function discoverAllTextProvidersFromSupabase(): Promise<string[]> {
    const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase env vars missing for provider discovery fallback");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
    });

    const now = new Date();
    const modelsRes = await supabase
        .from("data_api_provider_models")
        .select("provider_api_model_id,provider_id,is_active_gateway,effective_from,effective_to")
        .eq("is_active_gateway", true);
    if (modelsRes.error) {
        throw new Error(modelsRes.error.message);
    }

    const modelRows = (modelsRes.data ?? []).filter((row: ProviderModelRow) => {
        if (!row?.provider_api_model_id || !row?.provider_id) return false;
        const from = row.effective_from ? new Date(row.effective_from) : null;
        const to = row.effective_to ? new Date(row.effective_to) : null;
        if (from && Number.isFinite(from.getTime()) && now < from) return false;
        if (to && Number.isFinite(to.getTime()) && now >= to) return false;
        return true;
    });

    const providerModelIds = modelRows
        .map((row: ProviderModelRow) => row.provider_api_model_id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);
    if (!providerModelIds.length) return [];

    const capsRes = await supabase
        .from("data_api_provider_model_capabilities")
        .select("provider_api_model_id")
        .in("provider_api_model_id", providerModelIds)
        .eq("capability_id", "text.generate")
        .eq("status", "active");
    if (capsRes.error) {
        throw new Error(capsRes.error.message);
    }

    const supportedIds = new Set(
        (capsRes.data ?? [])
            .map((row: ProviderCapabilityRow) => row.provider_api_model_id)
            .filter((value): value is string => typeof value === "string" && value.length > 0)
    );

    const providers = new Set<string>();
    for (const row of modelRows) {
        if (!row.provider_api_model_id || !supportedIds.has(row.provider_api_model_id)) continue;
        if (!row.provider_id) continue;
        providers.add(row.provider_id);
    }

    return [...providers].sort((a, b) => a.localeCompare(b));
}

async function discoverAllApiProvidersFromSupabase(): Promise<string[]> {
    const supabaseUrl = normalizeEnvValue(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL);
    const supabaseKey = normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase env vars missing for provider discovery fallback");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
    });

    const providersRes = await supabase
        .from("data_api_providers")
        .select("api_provider_id");
    if (providersRes.error) {
        throw new Error(providersRes.error.message);
    }

    const providers = new Set<string>();
    for (const row of (providersRes.data ?? []) as SupabaseProviderRow[]) {
        if (!row?.api_provider_id) continue;
        providers.add(String(row.api_provider_id));
    }

    return [...providers].sort((a, b) => a.localeCompare(b));
}

function runVitest(cwd: string, env: NodeJS.ProcessEnv, args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
        const cleaned = sanitizeEnvForSpawn(env);
        if (cleaned.droppedKeys.length > 0) {
            console.warn(
                `[live-provider-tests] dropped env vars with NUL bytes for spawn: ${cleaned.droppedKeys.join(",")}`
            );
        }
        const child = spawn(
            "pnpm",
            [
                "exec",
                "vitest",
                "run",
                "tests/integration/active-providers.live.spec.ts",
                ...args,
            ],
            {
                cwd,
                env: cleaned.env,
                stdio: "inherit",
                // Required for reliable command resolution on Windows.
                shell: process.platform === "win32",
            },
        );
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 1));
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    loadLocalEnv(apiRoot);
    const gatewayUrl = normalizeGatewayUrl(args.gatewayUrl ?? process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1");
    const apiKeyResolved = resolveGatewayApiKey(args.apiKey);
    const apiKey = apiKeyResolved.key;

    if (!apiKey) {
        throw new Error(
            "Missing API key. Pass --api-key, set GATEWAY_API_KEY, or set PLAYGROUND_KEY + PLAYGROUND_GATEWAY_KEY_KID."
        );
    }

    if (!looksLikeGatewayAuthToken(apiKey)) {
        throw new Error(
            `Resolved API key source (${apiKeyResolved.source || "unknown"}) is not in a supported gateway auth format. ` +
            "Expected aistats_v1_sk_* key or OAuth JWT."
        );
    }

    if (apiKeyResolved.derivedFromPlayground) {
        console.log("[live-provider-tests] derived gateway API key from playground environment");
    }

    let providers = args.providers;
    if (!providers.length || args.allProviders || args.allApiProviders) {
        if (args.allApiProviders) {
            try {
                providers = await discoverAllApiProviders(gatewayUrl, apiKey);
            } catch (error) {
                console.warn(
                    `[live-provider-tests] /v1/providers discovery failed, falling back to Supabase: ${String((error as Error)?.message ?? error)}`
                );
                providers = await discoverAllApiProvidersFromSupabase();
            }
        } else {
            try {
                providers = await discoverAllTextProviders(gatewayUrl, apiKey);
            } catch (error) {
                console.warn(
                    `[live-provider-tests] /v1/api/models discovery failed, falling back to Supabase: ${String((error as Error)?.message ?? error)}`
                );
                providers = await discoverAllTextProvidersFromSupabase();
            }
        }
    }
    providers = normalizeProviderList(providers);
    if (!providers.length) {
        if (args.allApiProviders) {
            throw new Error("No providers resolved. Ensure /v1/providers returns providers or pass --provider.");
        }
        throw new Error("No providers resolved. Pass --provider or ensure /v1/api/models has active text.generate providers.");
    }

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        LIVE_RUN: "1",
        GATEWAY_URL: gatewayUrl,
        GATEWAY_API_KEY: apiKey,
        LIVE_PROVIDERS: providers.join(","),
        LIVE_ALLOW_TRANSIENT_FAILURES:
            args.allowTransientFailures ??
            parseBooleanEnv(process.env.LIVE_ALLOW_TRANSIENT_FAILURES) ??
            "0",
    };

    if (args.scenarios.length) {
        env.LIVE_SCENARIOS = args.scenarios.join(",");
    }
    if (args.modelOverrides.length) {
        env.LIVE_MODEL_OVERRIDES = args.modelOverrides.join(",");
    }
    if (args.maxOutputTokens) env.LIVE_MAX_OUTPUT_TOKENS = args.maxOutputTokens;
    if (args.includeTuning) env.LIVE_INCLUDE_TUNING = args.includeTuning;
    if (args.requireUsage) env.LIVE_REQUIRE_USAGE = args.requireUsage;
    if (args.requireUsageNonzero) env.LIVE_REQUIRE_USAGE_NONZERO = args.requireUsageNonzero;
    const reportSlug = args.allApiProviders
        ? "all-api-providers"
        : (args.allProviders || providers.length > 4
            ? "all-providers"
            : providers.join("-").replace(/[^a-zA-Z0-9_-]+/g, "-"));
    const reportPath = path.join(
        apiRoot,
        "reports",
        "provider-live",
        `${reportSlug}-${timestampStamp()}.json`
    );
    env.LIVE_RESULTS_PATH = reportPath;

    console.log(`[live-provider-tests] providers=${providers.join(",")}`);
    console.log(`[live-provider-tests] allowTransientFailures=${env.LIVE_ALLOW_TRANSIENT_FAILURES === "1"}`);
    console.log(`[live-provider-tests] results=${reportPath}`);
    if (args.scenarios.length) {
        console.log(`[live-provider-tests] scenarios=${args.scenarios.join(",")}`);
    }
    const code = await runVitest(apiRoot, env, args.vitestArgs);
    process.exit(code);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[live-provider-tests] ${redactSensitiveText(message)}`);
    process.exit(1);
});
