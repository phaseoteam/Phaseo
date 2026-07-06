import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

type CliArgs = {
    statuses: string[];
    providers: string[];
    gatewayUrl?: string;
    apiKey?: string;
    internalToken?: string;
    timeoutMs: number;
    maxTokens: number;
    concurrency: number;
    includeDebug: boolean;
    help: boolean;
};

type CatalogProvider = {
    id: string;
    status: string;
};

type ProviderModelCapability = {
    capability_id?: string;
    status?: string;
};

type ProviderModelRow = {
    api_model_id?: string | null;
    provider_api_model_id?: string | null;
    internal_model_id?: string | null;
    is_active_gateway?: boolean | null;
    capabilities?: ProviderModelCapability[] | null;
};

type PricingRule = {
    meter?: string;
    price_per_unit?: number;
    pricing_plan?: string | null;
};

type PricingFile = {
    capability_id?: string;
    api_model_id?: string;
    rules?: PricingRule[];
};

type SelectedModel = {
    modelId: string;
    source: "pricing" | "heuristic" | "first";
    estimatedTextCostPerMInputOutput?: number;
};

type ProbeResult = {
    ok: boolean;
    statusCode: number;
    elapsedMs: number;
    endpoint: string;
    error?: string;
};

type ProviderRunResult = {
    providerId: string;
    providerStatus: string;
    selectedModel: string | null;
    modelSelectionSource: SelectedModel["source"] | "none";
    estimatedTextCostPerMInputOutput: number | null;
    nonstream: ProbeResult | null;
    stream: ProbeResult | null;
    overall: "passed" | "failed" | "skipped_no_model";
};

const PROVIDER_ALIASES: Record<string, string> = {
    arcee: "arcee-ai",
    "arcee-ai": "arcee-ai",
    xai: "x-ai",
    "x-ai": "x-ai",
    novita: "novitaai",
    "novita-ai": "novitaai",
};

const DEFAULT_STATUSES = ["alpha", "beta"];
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_TOKENS = 16;
const DEFAULT_CONCURRENCY = 4;

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

function normalizeStatus(value: string): string {
    return value.trim().toLowerCase();
}

function parseArgs(argv: string[]): CliArgs {
    const out: CliArgs = {
        statuses: [...DEFAULT_STATUSES],
        providers: [],
        timeoutMs: DEFAULT_TIMEOUT_MS,
        maxTokens: DEFAULT_MAX_TOKENS,
        concurrency: DEFAULT_CONCURRENCY,
        includeDebug: false,
        help: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (!arg) continue;
        const readValue = () => argv[++index];

        if (arg === "--help" || arg === "-h") {
            out.help = true;
            continue;
        }
        if (arg === "--statuses" || arg === "--status") {
            const values = parseCsv(readValue());
            if (values.length) out.statuses = values.map(normalizeStatus);
            continue;
        }
        if (arg.startsWith("--statuses=")) {
            const values = parseCsv(arg.slice("--statuses=".length));
            if (values.length) out.statuses = values.map(normalizeStatus);
            continue;
        }
        if (arg.startsWith("--status=")) {
            const values = parseCsv(arg.slice("--status=".length));
            if (values.length) out.statuses = values.map(normalizeStatus);
            continue;
        }
        if (arg === "--providers" || arg === "--provider") {
            out.providers.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--providers=")) {
            out.providers.push(...parseCsv(arg.slice("--providers=".length)));
            continue;
        }
        if (arg.startsWith("--provider=")) {
            out.providers.push(...parseCsv(arg.slice("--provider=".length)));
            continue;
        }
        if (arg === "--gateway-url") {
            out.gatewayUrl = readValue();
            continue;
        }
        if (arg.startsWith("--gateway-url=")) {
            out.gatewayUrl = arg.slice("--gateway-url=".length);
            continue;
        }
        if (arg === "--api-key") {
            out.apiKey = readValue();
            continue;
        }
        if (arg.startsWith("--api-key=")) {
            out.apiKey = arg.slice("--api-key=".length);
            continue;
        }
        if (arg === "--internal-token") {
            out.internalToken = readValue();
            continue;
        }
        if (arg.startsWith("--internal-token=")) {
            out.internalToken = arg.slice("--internal-token=".length);
            continue;
        }
        if (arg === "--timeout-ms") {
            const parsed = Number(readValue());
            if (Number.isFinite(parsed) && parsed > 0) out.timeoutMs = Math.floor(parsed);
            continue;
        }
        if (arg.startsWith("--timeout-ms=")) {
            const parsed = Number(arg.slice("--timeout-ms=".length));
            if (Number.isFinite(parsed) && parsed > 0) out.timeoutMs = Math.floor(parsed);
            continue;
        }
        if (arg === "--max-tokens") {
            const parsed = Number(readValue());
            if (Number.isFinite(parsed) && parsed > 0) out.maxTokens = Math.floor(parsed);
            continue;
        }
        if (arg.startsWith("--max-tokens=")) {
            const parsed = Number(arg.slice("--max-tokens=".length));
            if (Number.isFinite(parsed) && parsed > 0) out.maxTokens = Math.floor(parsed);
            continue;
        }
        if (arg === "--concurrency") {
            const parsed = Number(readValue());
            if (Number.isFinite(parsed) && parsed > 0) out.concurrency = Math.floor(parsed);
            continue;
        }
        if (arg.startsWith("--concurrency=")) {
            const parsed = Number(arg.slice("--concurrency=".length));
            if (Number.isFinite(parsed) && parsed > 0) out.concurrency = Math.floor(parsed);
            continue;
        }
        if (arg === "--debug-upstream") {
            out.includeDebug = true;
            continue;
        }
    }

    out.statuses = [...new Set(out.statuses.map(normalizeStatus).filter(Boolean))];
    out.providers = [...new Set(out.providers.map(normalizeProviderId).filter(Boolean))];
    return out;
}

function printUsage() {
    console.log("Quick Alpha/Beta provider smoke test (non-stream + stream) with internal override.");
    console.log("");
    console.log("Usage:");
    console.log("  pnpm --filter @phaseo/gateway-api exec tsx scripts/run-alpha-beta-provider-smoke.ts");
    console.log("  pnpm --filter @phaseo/gateway-api exec tsx scripts/run-alpha-beta-provider-smoke.ts --providers atlascloud,deepinfra");
    console.log("  pnpm --filter @phaseo/gateway-api exec tsx scripts/run-alpha-beta-provider-smoke.ts --statuses alpha,beta --timeout-ms 15000");
}

function normalizeGatewayUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "http://127.0.0.1:8787/v1";
    if (trimmed.endsWith("/v1")) return trimmed;
    if (trimmed.endsWith("/v1/")) return trimmed.slice(0, -1);
    if (trimmed.endsWith("/")) return `${trimmed}v1`;
    return `${trimmed}/v1`;
}

function normalizeEnvValue(value: string | undefined): string {
    if (!value) return "";
    return value.trim().replace(/^['"]|['"]$/g, "");
}

function looksLikeGatewayAuthToken(token: string): boolean {
    if (!token) return false;
    if (token.startsWith("phaseo_v1_sk_")) return true;
    return token.split(".").length === 3;
}

function resolveGatewayApiKey(cliValue?: string): string {
    const directCli = normalizeEnvValue(cliValue);
    if (directCli) return directCli;
    const direct = normalizeEnvValue(process.env.GATEWAY_API_KEY);
    if (direct) return direct;
    const explicit = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY);
    if (explicit) return explicit;
    const secret = normalizeEnvValue(process.env.PLAYGROUND_KEY);
    if (!secret) return "";
    if (looksLikeGatewayAuthToken(secret)) return secret;
    const kid = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY_KID);
    if (!kid) return secret;
    return `phaseo_v1_sk_${kid}_${secret}`;
}

function resolveInternalToken(cliValue?: string): string {
    const directCli = normalizeEnvValue(cliValue);
    if (directCli) return directCli;
    return normalizeEnvValue(process.env.LIVE_INTERNAL_TEST_TOKEN ?? process.env.GATEWAY_INTERNAL_TEST_TOKEN);
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

function scoreModelHeuristic(modelId: string): number {
    const lower = modelId.toLowerCase();
    let score = 100;
    const add = (needle: string, delta: number) => {
        if (lower.includes(needle)) score += delta;
    };
    add("free", -100);
    add("nano", -45);
    add("mini", -35);
    add("flash", -30);
    add("lite", -20);
    add("small", -15);
    add("haiku", -10);
    add("turbo", -5);
    add("pro", 15);
    add("max", 25);
    add("thinking", 20);
    return score;
}

function parseProviderCatalogProviders(
    catalogProvidersDir: string,
    statuses: Set<string>,
    providerFilter: Set<string>
): CatalogProvider[] {
    const out: CatalogProvider[] = [];
    const dirs = fs.readdirSync(catalogProvidersDir, { withFileTypes: true });
    for (const dirent of dirs) {
        if (!dirent.isDirectory()) continue;
        const providerFile = path.join(catalogProvidersDir, dirent.name, "api_provider.json");
        if (!fs.existsSync(providerFile)) continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(providerFile, "utf8")) as {
                api_provider_id?: unknown;
                status?: unknown;
            };
            const providerIdRaw =
                typeof parsed.api_provider_id === "string" && parsed.api_provider_id.trim()
                    ? parsed.api_provider_id.trim()
                    : dirent.name;
            const providerId = normalizeProviderId(providerIdRaw);
            const providerStatus = typeof parsed.status === "string" ? parsed.status.trim() : "";
            if (!providerId || !providerStatus) continue;
            if (!statuses.has(normalizeStatus(providerStatus))) continue;
            if (providerFilter.size > 0 && !providerFilter.has(providerId)) continue;
            out.push({
                id: providerId,
                status: providerStatus,
            });
        } catch {
            continue;
        }
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
}

function listProviderTextModels(providerModelsPath: string): ProviderModelRow[] {
    if (!fs.existsSync(providerModelsPath)) return [];
    try {
        const parsed = JSON.parse(fs.readFileSync(providerModelsPath, "utf8")) as ProviderModelRow[];
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((row) => {
            const apiModelId = row?.api_model_id ? String(row.api_model_id).trim() : "";
            if (!apiModelId) return false;
            const caps = Array.isArray(row.capabilities) ? row.capabilities : [];
            const hasTextCapability = caps.some((cap) => {
                const capId = String(cap?.capability_id ?? "").trim().toLowerCase();
                return capId === "text.generate";
            });
            if (hasTextCapability) return true;
            const providerApiModelId = String(row.provider_api_model_id ?? "").toLowerCase();
            return providerApiModelId.includes("text.generate");
        });
    } catch {
        return [];
    }
}

function collectProviderPricingTextCostMap(pricingProviderDir: string): Map<string, number> {
    const out = new Map<string, number>();
    if (!fs.existsSync(pricingProviderDir)) return out;

    const stack: string[] = [pricingProviderDir];
    while (stack.length) {
        const current = stack.pop()!;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (!entry.isFile() || entry.name !== "pricing.json") continue;
            try {
                const pricing = JSON.parse(fs.readFileSync(full, "utf8")) as PricingFile;
                const capabilityId = String(pricing.capability_id ?? "").toLowerCase();
                const apiModelId = String(pricing.api_model_id ?? "").trim();
                if (!apiModelId || capabilityId !== "text.generate") continue;
                const rules = Array.isArray(pricing.rules) ? pricing.rules : [];
                let inputPrice = Number.POSITIVE_INFINITY;
                let outputPrice = Number.POSITIVE_INFINITY;
                for (const rule of rules) {
                    const meter = String(rule?.meter ?? "").toLowerCase();
                    const plan = String(rule?.pricing_plan ?? "standard").toLowerCase();
                    const price = Number(rule?.price_per_unit);
                    if (!Number.isFinite(price)) continue;
                    if (plan !== "standard") continue;
                    if (meter === "input_text_tokens") {
                        inputPrice = Math.min(inputPrice, price);
                    }
                    if (meter === "output_text_tokens") {
                        outputPrice = Math.min(outputPrice, price);
                    }
                }
                if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice)) continue;
                const total = inputPrice + outputPrice;
                const prev = out.get(apiModelId);
                if (prev === undefined || total < prev) {
                    out.set(apiModelId, total);
                }
            } catch {
                continue;
            }
        }
    }
    return out;
}

function selectCheapestModel(
    candidateModelIds: string[],
    pricingByModelId: Map<string, number>
): SelectedModel | null {
    const modelIds = [...new Set(candidateModelIds.map((value) => String(value ?? "").trim()).filter(Boolean))];
    if (!modelIds.length) return null;

    const priced = modelIds
        .map((modelId) => ({
            modelId,
            cost: pricingByModelId.get(modelId),
        }))
        .filter((entry): entry is { modelId: string; cost: number } => Number.isFinite(entry.cost));

    if (priced.length) {
        priced.sort((left, right) => left.cost - right.cost || left.modelId.localeCompare(right.modelId));
        return {
            modelId: priced[0]!.modelId,
            source: "pricing",
            estimatedTextCostPerMInputOutput: priced[0]!.cost,
        };
    }

    const fallback = [...modelIds].sort((left, right) => {
        const score = scoreModelHeuristic(left) - scoreModelHeuristic(right);
        if (score !== 0) return score;
        return left.localeCompare(right);
    })[0];

    if (!fallback) return null;
    return {
        modelId: fallback,
        source: "heuristic",
    };
}

function catalogTextModelIds(modelRows: ProviderModelRow[]): string[] {
    return [...new Set(
        modelRows
            .map((row) => String(row.api_model_id ?? "").trim())
            .filter(Boolean)
    )];
}

async function fetchLiveTextModelsByProvider(args: {
    gatewayUrl: string;
    apiKey: string;
    providerIds: string[];
    timeoutMs: number;
}): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    const targetSet = new Set(args.providerIds.map((value) => String(value).trim().toLowerCase()).filter(Boolean));
    if (!targetSet.size) return out;

    const base = args.gatewayUrl.endsWith("/") ? args.gatewayUrl.slice(0, -1) : args.gatewayUrl;
    let offset = 0;
    const limit = 250;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
        const url = new URL(`${base}/models`);
        url.searchParams.set("limit", String(limit));
        url.searchParams.set("offset", String(offset));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(`timeout:${args.timeoutMs}`), args.timeoutMs);
        let response: Response;
        try {
            response = await fetch(url, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${args.apiKey}`,
                },
                signal: controller.signal,
            });
        } finally {
            clearTimeout(timeout);
        }
        const payload = await response.json() as {
            total?: number;
            models?: Array<{
                model_id?: string;
                endpoints?: string[];
                providers?: Array<{
                    api_provider_id?: string;
                    endpoint?: string;
                    is_active_gateway?: boolean;
                }>;
            }>;
        };
        if (!response.ok) {
            throw new Error(`Failed live model discovery (${response.status})`);
        }

        const rows = Array.isArray(payload.models) ? payload.models : [];
        for (const row of rows) {
            const modelId = String(row?.model_id ?? "").trim();
            if (!modelId) continue;
            const modelEndpoints = Array.isArray(row?.endpoints)
                ? row.endpoints.map((value) => String(value))
                : [];
            const modelSupportsText = modelEndpoints.includes("text.generate");
            const providers = Array.isArray(row?.providers) ? row.providers : [];
            for (const provider of providers) {
                const providerId = String(provider?.api_provider_id ?? "").trim().toLowerCase();
                if (!providerId || !targetSet.has(providerId)) continue;
                if (provider?.is_active_gateway === false) continue;
                const providerSupportsText = provider?.endpoint
                    ? String(provider.endpoint) === "text.generate"
                    : modelSupportsText;
                if (!providerSupportsText) continue;
                const existing = out.get(providerId) ?? [];
                if (!existing.includes(modelId)) existing.push(modelId);
                out.set(providerId, existing);
            }
        }

        total = typeof payload.total === "number" ? payload.total : rows.length;
        offset += limit;
        if (!rows.length) break;
    }

    return out;
}

async function postWithTimeout(args: {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    timeoutMs: number;
}): Promise<{ status: number; elapsedMs: number; text: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(`timeout:${args.timeoutMs}`), args.timeoutMs);
    const startedAt = Date.now();
    try {
        const response = await fetch(args.url, {
            method: "POST",
            headers: args.headers,
            body: JSON.stringify(args.body),
            signal: controller.signal,
        });
        const text = await response.text();
        return {
            status: response.status,
            elapsedMs: Date.now() - startedAt,
            text,
        };
    } finally {
        clearTimeout(timeout);
    }
}

function buildHeaders(args: {
    apiKey: string;
    includeTestingMode: boolean;
    internalToken: string;
}): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
    };
    if (args.includeTestingMode) {
        headers["x-aistats-testing-mode"] = "true";
        if (args.internalToken) {
            headers["x-aistats-internal-token"] = args.internalToken;
        }
    }
    return headers;
}

function parseErrorMessage(payloadText: string): string | undefined {
    try {
        const parsed = JSON.parse(payloadText) as any;
        if (typeof parsed?.error === "string") return parsed.error;
        if (typeof parsed?.message === "string") return parsed.message;
        if (typeof parsed?.reason === "string") return parsed.reason;
    } catch {
        // no-op
    }
    return payloadText.slice(0, 240);
}

async function runProviderProbe(args: {
    provider: CatalogProvider;
    model: SelectedModel;
    gatewayUrl: string;
    headers: Record<string, string>;
    timeoutMs: number;
    maxTokens: number;
    includeDebug: boolean;
}): Promise<ProviderRunResult> {
    const commonBody: Record<string, unknown> = {
        model: args.model.modelId,
        provider: { only: [args.provider.id] },
    };
    if (args.includeDebug) {
        commonBody.debug = {
            enabled: true,
            return_upstream_response: true,
            trace: true,
        };
    }

    const attempts = [
        {
            endpoint: "/chat/completions",
            nonstreamBody: {
                ...commonBody,
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: args.maxTokens,
                stream: false,
            } as Record<string, unknown>,
            streamBody: {
                ...commonBody,
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: args.maxTokens,
                stream: true,
            } as Record<string, unknown>,
        },
        {
            endpoint: "/responses",
            nonstreamBody: {
                ...commonBody,
                input: "Hi",
                max_output_tokens: args.maxTokens,
                stream: false,
            } as Record<string, unknown>,
            streamBody: {
                ...commonBody,
                input: "Hi",
                max_output_tokens: args.maxTokens,
                stream: true,
            } as Record<string, unknown>,
        },
    ];

    let nonstream: ProbeResult = {
        ok: false,
        statusCode: 0,
        elapsedMs: 0,
        endpoint: attempts[0]!.endpoint,
        error: "not_run",
    };
    for (const attempt of attempts) {
        const response = await postWithTimeout({
            url: `${args.gatewayUrl}${attempt.endpoint}`,
            headers: args.headers,
            body: attempt.nonstreamBody,
            timeoutMs: args.timeoutMs,
        }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            return {
                status: 0,
                elapsedMs: args.timeoutMs,
                text: message,
            };
        });

        const ok = response.status >= 200 && response.status < 300;
        nonstream = {
            ok,
            statusCode: response.status,
            elapsedMs: response.elapsedMs,
            endpoint: attempt.endpoint,
            error: ok ? undefined : parseErrorMessage(response.text),
        };
        if (ok) break;
    }

    let stream: ProbeResult = {
        ok: false,
        statusCode: 0,
        elapsedMs: 0,
        endpoint: attempts[0]!.endpoint,
        error: "not_run",
    };
    for (const attempt of attempts) {
        const response = await postWithTimeout({
            url: `${args.gatewayUrl}${attempt.endpoint}`,
            headers: args.headers,
            body: attempt.streamBody,
            timeoutMs: args.timeoutMs,
        }).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            return {
                status: 0,
                elapsedMs: args.timeoutMs,
                text: message,
            };
        });

        const payload = response.text;
        const looksValid =
            payload.includes("data:") ||
            payload.includes("[DONE]") ||
            payload.includes("\"choices\"") ||
            payload.includes("\"response\"");
        const okHttp = response.status >= 200 && response.status < 300;
        stream = {
            ok: okHttp && looksValid,
            statusCode: response.status,
            elapsedMs: response.elapsedMs,
            endpoint: attempt.endpoint,
            error: okHttp && looksValid ? undefined : parseErrorMessage(payload),
        };
        if (stream.ok) break;
    }

    const overall = nonstream.ok && stream.ok ? "passed" : "failed";
    return {
        providerId: args.provider.id,
        providerStatus: args.provider.status,
        selectedModel: args.model.modelId,
        modelSelectionSource: args.model.source,
        estimatedTextCostPerMInputOutput: args.model.estimatedTextCostPerMInputOutput ?? null,
        nonstream,
        stream,
        overall,
    };
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
    let index = 0;
    const runners = Array.from({ length: Math.max(1, limit) }, async () => {
        while (index < items.length) {
            const current = items[index];
            index += 1;
            await worker(current);
        }
    });
    await Promise.all(runners);
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

function printSummary(results: ProviderRunResult[]) {
    const passed = results.filter((row) => row.overall === "passed").length;
    const failed = results.filter((row) => row.overall === "failed").length;
    const skipped = results.filter((row) => row.overall === "skipped_no_model").length;
    console.log("");
    console.log(`[alpha-beta-smoke] completed providers=${results.length} passed=${passed} failed=${failed} skipped=${skipped}`);
    for (const row of results) {
        const cost = row.estimatedTextCostPerMInputOutput;
        const costLabel = Number.isFinite(cost) ? `$${cost!.toFixed(4)}/1M(in+out)` : "n/a";
        const modelLabel = row.selectedModel ?? "<none>";
        const nonstreamLabel = row.nonstream
            ? `${row.nonstream.statusCode}${row.nonstream.ok ? "" : "!"}@${row.nonstream.endpoint}`
            : "-";
        const streamLabel = row.stream
            ? `${row.stream.statusCode}${row.stream.ok ? "" : "!"}@${row.stream.endpoint}`
            : "-";
        console.log(
            `- ${row.providerId} [${row.providerStatus}] overall=${row.overall} model=${modelLabel} source=${row.modelSelectionSource} cost=${costLabel} nonstream=${nonstreamLabel} stream=${streamLabel}`
        );
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const repoRoot = path.resolve(apiRoot, "..", "..");
    loadLocalEnv(apiRoot);

    const gatewayUrl = normalizeGatewayUrl(args.gatewayUrl ?? process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1");
    const apiKey = resolveGatewayApiKey(args.apiKey);
    if (!apiKey || !looksLikeGatewayAuthToken(apiKey)) {
        throw new Error("Missing/invalid gateway API key. Pass --api-key or configure gateway/playground env vars.");
    }
    const internalToken = resolveInternalToken(args.internalToken);
    if (!internalToken) {
        throw new Error("Missing internal override token. Set GATEWAY_INTERNAL_TEST_TOKEN or pass --internal-token.");
    }

    const catalogProvidersDir = path.join(repoRoot, "packages", "data", "catalog", "src", "data", "api_providers");
    const catalogPricingDir = path.join(repoRoot, "packages", "data", "catalog", "src", "data", "pricing");
    if (!fs.existsSync(catalogProvidersDir)) {
        throw new Error(`Catalog providers path not found: ${catalogProvidersDir}`);
    }

    const selectedProviders = parseProviderCatalogProviders(
        catalogProvidersDir,
        new Set(args.statuses.map(normalizeStatus)),
        new Set(args.providers)
    );
    if (!selectedProviders.length) {
        throw new Error("No providers matched the requested statuses/filter.");
    }

    console.log(`[alpha-beta-smoke] providers=${selectedProviders.length} statuses=${args.statuses.join(",")} timeout_ms=${args.timeoutMs} concurrency=${args.concurrency}`);
    console.log(`[alpha-beta-smoke] gateway=${gatewayUrl}`);

    const headers = buildHeaders({
        apiKey,
        includeTestingMode: true,
        internalToken,
    });

    let liveModelsByProvider: Map<string, string[]> | null = null;
    try {
        liveModelsByProvider = await fetchLiveTextModelsByProvider({
            gatewayUrl,
            apiKey,
            providerIds: selectedProviders.map((provider) => provider.id),
            timeoutMs: Math.min(args.timeoutMs, 15_000),
        });
        const liveSummary = selectedProviders
            .map((provider) => `${provider.id}:${(liveModelsByProvider?.get(provider.id) ?? []).length}`)
            .join(", ");
        console.log(`[alpha-beta-smoke] live_text_model_counts=${liveSummary}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[alpha-beta-smoke] live model discovery unavailable; falling back to catalog model list (${message})`);
    }

    const results: ProviderRunResult[] = [];
    await runWithConcurrency(selectedProviders, args.concurrency, async (provider) => {
        const providerModelsPath = path.join(catalogProvidersDir, provider.id, "models.json");
        const providerPricingDir = path.join(catalogPricingDir, provider.id);
        const modelRows = listProviderTextModels(providerModelsPath);
        const catalogModelIds = catalogTextModelIds(modelRows);
        const pricingByModel = collectProviderPricingTextCostMap(providerPricingDir);
        const liveModelIds = liveModelsByProvider?.get(provider.id) ?? [];
        const candidateModelIds = liveModelsByProvider ? liveModelIds : catalogModelIds;
        const selectedModel = selectCheapestModel(candidateModelIds, pricingByModel);

        if (!selectedModel) {
            results.push({
                providerId: provider.id,
                providerStatus: provider.status,
                selectedModel: null,
                modelSelectionSource: "none",
                estimatedTextCostPerMInputOutput: null,
                nonstream: null,
                stream: null,
                overall: "skipped_no_model",
            });
            return;
        }

        const result = await runProviderProbe({
            provider,
            model: selectedModel,
            gatewayUrl,
            headers,
            timeoutMs: args.timeoutMs,
            maxTokens: args.maxTokens,
            includeDebug: args.includeDebug,
        });
        results.push(result);
    });

    results.sort((a, b) => a.providerId.localeCompare(b.providerId));
    printSummary(results);

    const reportPath = path.join(
        apiRoot,
        "reports",
        "provider-live",
        `alpha-beta-smoke-${timestampStamp()}.json`
    );
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
        reportPath,
        JSON.stringify(
            {
                generated_at: new Date().toISOString(),
                gateway_url: gatewayUrl,
                statuses: args.statuses,
                timeout_ms: args.timeoutMs,
                max_tokens: args.maxTokens,
                concurrency: args.concurrency,
                include_debug: args.includeDebug,
                provider_count: selectedProviders.length,
                results,
            },
            null,
            2
        ),
        "utf8"
    );
    console.log(`[alpha-beta-smoke] report=${reportPath}`);

    const hasFailures = results.some((row) => row.overall === "failed");
    process.exit(hasFailures ? 1 : 0);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[alpha-beta-smoke] ${message}`);
    process.exit(1);
});
