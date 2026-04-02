import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

type LiveRunRecord = {
    provider: string;
    scenario: string;
    model: string | null;
    status: string;
    error?: string;
};

type LiveReport = {
    runs?: LiveRunRecord[];
};

type ProbeResult = {
    provider: string;
    scenario: string;
    model: string;
    endpoint: string;
    stream: boolean;
    status: number;
    ok: boolean;
    gateway_error?: string | null;
    gateway_reason?: string | null;
    gateway_description?: string | null;
    failure_sample_first?: unknown;
    debug_upstream?: unknown;
    debug_attempt_errors?: unknown;
    response_json?: unknown;
    response_text?: string;
};

type ScenarioConfig = {
    endpoint: "/responses" | "/chat/completions";
    stream: boolean;
    buildBody: (model: string) => Record<string, unknown>;
};

const SCENARIOS: Record<string, ScenarioConfig> = {
    responses_nonstream_hi: {
        endpoint: "/responses",
        stream: false,
        buildBody: (model) => ({
            model,
            input: "Hi",
        }),
    },
    responses_stream_hi: {
        endpoint: "/responses",
        stream: true,
        buildBody: (model) => ({
            model,
            input: "Hi",
            stream: true,
        }),
    },
    chat_nonstream_hi: {
        endpoint: "/chat/completions",
        stream: false,
        buildBody: (model) => ({
            model,
            messages: [{ role: "user", content: "Hi" }],
        }),
    },
    chat_stream_hi: {
        endpoint: "/chat/completions",
        stream: true,
        buildBody: (model) => ({
            model,
            messages: [{ role: "user", content: "Hi" }],
            stream: true,
        }),
    },
};

function normalizeEnvValue(value: string | undefined): string {
    if (!value) return "";
    return value.trim().replace(/^['"]|['"]$/g, "");
}

function looksLikeGatewayAuthToken(token: string): boolean {
    if (!token) return false;
    if (token.startsWith("aistats_v1_sk_")) return true;
    return token.split(".").length === 3;
}

function resolveGatewayApiKey(argsKey?: string): {
    key: string;
    source: string;
} {
    const cli = normalizeEnvValue(argsKey);
    if (cli) {
        return { key: cli, source: "--api-key" };
    }

    const direct = normalizeEnvValue(process.env.GATEWAY_API_KEY);
    if (direct) {
        return { key: direct, source: "GATEWAY_API_KEY" };
    }

    const explicitGateway = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY);
    if (explicitGateway) {
        return {
            key: explicitGateway,
            source: "PLAYGROUND_GATEWAY_KEY",
        };
    }

    const playgroundSecret = normalizeEnvValue(process.env.PLAYGROUND_KEY);
    const playgroundKid = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY_KID);
    if (!playgroundSecret) {
        return { key: "", source: "" };
    }

    if (looksLikeGatewayAuthToken(playgroundSecret)) {
        return {
            key: playgroundSecret,
            source: "PLAYGROUND_KEY",
        };
    }

    if (playgroundKid) {
        return {
            key: `aistats_v1_sk_${playgroundKid}_${playgroundSecret}`,
            source: "PLAYGROUND_KEY+PLAYGROUND_GATEWAY_KEY_KID",
        };
    }

    return {
        key: playgroundSecret,
        source: "PLAYGROUND_KEY",
    };
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

function toTimestampSlug(date = new Date()): string {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function latestAllProvidersReportPath(reportsDir: string): string {
    const files = fs
        .readdirSync(reportsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /^all-providers-\d{8}-\d{6}\.json$/.test(entry.name))
        .map((entry) => ({
            name: entry.name,
            fullPath: path.join(reportsDir, entry.name),
            mtimeMs: fs.statSync(path.join(reportsDir, entry.name)).mtimeMs,
        }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (!files.length) {
        throw new Error(`No all-providers JSON reports found in ${reportsDir}`);
    }
    return files[0]!.fullPath;
}

function parseArgs(argv: string[]): {
    gatewayUrl?: string;
    apiKey?: string;
    reportPath?: string;
    providers?: string[];
    testingMode?: boolean;
} {
    const out: {
        gatewayUrl?: string;
        apiKey?: string;
        reportPath?: string;
        providers?: string[];
        testingMode?: boolean;
    } = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = () => argv[++i];
        if (arg === "--gateway-url") {
            out.gatewayUrl = next();
            continue;
        }
        if (arg.startsWith("--gateway-url=")) {
            out.gatewayUrl = arg.slice("--gateway-url=".length);
            continue;
        }
        if (arg === "--api-key") {
            out.apiKey = next();
            continue;
        }
        if (arg.startsWith("--api-key=")) {
            out.apiKey = arg.slice("--api-key=".length);
            continue;
        }
        if (arg === "--report") {
            out.reportPath = next();
            continue;
        }
        if (arg.startsWith("--report=")) {
            out.reportPath = arg.slice("--report=".length);
            continue;
        }
        if (arg === "--providers") {
            out.providers = String(next() ?? "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
            continue;
        }
        if (arg.startsWith("--providers=")) {
            out.providers = arg
                .slice("--providers=".length)
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean);
            continue;
        }
        if (arg === "--testing-mode") {
            out.testingMode = true;
            continue;
        }
    }
    return out;
}

function normalizeBaseUrl(input: string): string {
    const trimmed = input.trim();
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function withProviderOnly(body: Record<string, unknown>, providerId: string): Record<string, unknown> {
    const current = body.provider;
    const existing =
        current && typeof current === "object" && !Array.isArray(current)
            ? (current as Record<string, unknown>)
            : {};
    const existingOnly = Array.isArray(existing.only)
        ? existing.only.map((entry) => String(entry)).filter(Boolean)
        : [];
    const only = Array.from(new Set([...existingOnly, providerId]));
    return {
        ...body,
        provider: {
            ...existing,
            only,
        },
    };
}

async function run() {
    const args = parseArgs(process.argv.slice(2));
    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const reportsDir = path.resolve(apiRoot, "reports", "provider-live");
    loadLocalEnv(apiRoot);

    const gatewayUrl = normalizeBaseUrl(args.gatewayUrl ?? process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/v1");
    const key = resolveGatewayApiKey(args.apiKey);
    if (!key.key) {
        throw new Error("Missing gateway API key. Set GATEWAY_API_KEY/PLAYGROUND_KEY or pass --api-key");
    }

    const reportPath = path.resolve(args.reportPath ?? latestAllProvidersReportPath(reportsDir));
    const reportRaw = fs.readFileSync(reportPath, "utf8");
    const report = JSON.parse(reportRaw) as LiveReport;
    const failedRuns = (report.runs ?? []).filter((run) => run.status === "failed" && run.model);
    if (!failedRuns.length) {
        throw new Error(`No failed runs with models found in ${reportPath}`);
    }

    const providerFilter = new Set((args.providers ?? []).map((value) => value.toLowerCase()));
    const targets = failedRuns.filter((run) =>
        Boolean(SCENARIOS[run.scenario]) &&
        (providerFilter.size === 0 || providerFilter.has(run.provider.toLowerCase()))
    );
    if (!targets.length) {
        throw new Error("No failed runs matched supported scenarios");
    }

    console.log(`[debug-failed-providers] report=${reportPath}`);
    console.log(`[debug-failed-providers] gateway=${gatewayUrl}`);
    console.log(`[debug-failed-providers] api_key_source=${key.source}`);
    console.log(`[debug-failed-providers] testing_mode=${args.testingMode ? "on" : "off"}`);
    console.log(`[debug-failed-providers] targets=${targets.length}`);

    const results: ProbeResult[] = [];
    for (const run of targets) {
        const scenario = SCENARIOS[run.scenario];
        const model = String(run.model);
        const body = withProviderOnly(scenario.buildBody(model), run.provider);
        const payload = {
            ...body,
            debug: {
                enabled: true,
                return_upstream_response: true,
                trace: true,
                trace_level: "full",
            },
        };

        const headers: Record<string, string> = {
            Authorization: `Bearer ${key.key}`,
            "Content-Type": "application/json",
            "x-gateway-debug": "1",
        };
        if (args.testingMode) {
            headers["x-aistats-testing-mode"] = "1";
            if (process.env.GATEWAY_INTERNAL_TEST_TOKEN) {
                headers["x-aistats-internal-token"] = process.env.GATEWAY_INTERNAL_TEST_TOKEN;
            }
        }

        const url = `${gatewayUrl}${scenario.endpoint}`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        const text = await res.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        const failureSampleFirst = Array.isArray(json?.failure_sample) ? json.failure_sample[0] : null;
        const gatewayError = typeof json?.error === "string" ? json.error : null;
        const upstreamSummary =
            typeof failureSampleFirst?.upstream_error_message === "string"
                ? failureSampleFirst.upstream_error_message
                : typeof json?.upstream_error?.message === "string"
                    ? json.upstream_error.message
                    : null;

        console.log(
            `[probe] ${run.provider} ${run.scenario} -> status=${res.status} error=${gatewayError ?? "none"} upstream=${upstreamSummary ?? "n/a"}`
        );

        results.push({
            provider: run.provider,
            scenario: run.scenario,
            model,
            endpoint: scenario.endpoint,
            stream: scenario.stream,
            status: res.status,
            ok: res.ok,
            gateway_error: gatewayError,
            gateway_reason: typeof json?.reason === "string" ? json.reason : null,
            gateway_description: typeof json?.description === "string" ? json.description : null,
            failure_sample_first: failureSampleFirst,
            debug_upstream: json?.debug?.upstream ?? null,
            debug_attempt_errors: json?.debug?.attempt_errors ?? null,
            response_json: json ?? null,
            response_text: json ? undefined : text,
        });
    }

    const outPath = path.join(reportsDir, `debug-failed-upstream-${toTimestampSlug()}.json`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
        outPath,
        JSON.stringify(
            {
                generated_at: new Date().toISOString(),
                gateway_url: gatewayUrl,
                report_source: reportPath,
                target_count: targets.length,
                results,
            },
            null,
            2,
        ),
        "utf8",
    );
    console.log(`[debug-failed-providers] output=${outPath}`);
}

run().catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`[debug-failed-providers] ${message}`);
    process.exit(1);
});
