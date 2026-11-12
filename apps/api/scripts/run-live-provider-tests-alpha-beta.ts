import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

type CliArgs = {
    statuses: string[];
    providers: string[];
    scenarios: string[];
    passThrough: string[];
    help: boolean;
};

type CatalogProvider = {
    id: string;
    status: string;
};

// Maps older provider IDs to v2_providers.provider_slug.
const PROVIDER_ALIASES: Record<string, string> = {
    arcee: "arcee-ai",
    "x-ai": "xai",
    novitaai: "novita",
};

const DEFAULT_STATUSES = ["alpha", "beta"];

const DEFAULT_SCENARIOS = [
    "responses_nonstream_hi",
    "responses_stream_hi",
    "chat_nonstream_hi",
    "chat_stream_hi",
];

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

function parseArgs(argv: string[]): CliArgs {
    const passthroughIndex = argv.indexOf("--");
    const args = passthroughIndex >= 0 ? argv.slice(0, passthroughIndex) : argv;
    const passThrough = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : [];

    const out: CliArgs = {
        statuses: [],
        providers: [],
        scenarios: [],
        passThrough,
        help: false,
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (!arg) continue;
        const readValue = () => args[++i];

        if (arg === "--help" || arg === "-h") {
            out.help = true;
            continue;
        }
        if (arg === "--status" || arg === "--statuses") {
            out.statuses.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--status=")) {
            out.statuses.push(...parseCsv(arg.slice("--status=".length)));
            continue;
        }
        if (arg.startsWith("--statuses=")) {
            out.statuses.push(...parseCsv(arg.slice("--statuses=".length)));
            continue;
        }
        if (arg === "--provider" || arg === "--providers") {
            out.providers.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--provider=")) {
            out.providers.push(...parseCsv(arg.slice("--provider=".length)));
            continue;
        }
        if (arg.startsWith("--providers=")) {
            out.providers.push(...parseCsv(arg.slice("--providers=".length)));
            continue;
        }
        if (arg === "--scenario" || arg === "--scenarios") {
            out.scenarios.push(...parseCsv(readValue()));
            continue;
        }
        if (arg.startsWith("--scenario=")) {
            out.scenarios.push(...parseCsv(arg.slice("--scenario=".length)));
            continue;
        }
        if (arg.startsWith("--scenarios=")) {
            out.scenarios.push(...parseCsv(arg.slice("--scenarios=".length)));
            continue;
        }
    }

    out.statuses = [...new Set((out.statuses.length ? out.statuses : DEFAULT_STATUSES).map((s) => s.toLowerCase()))];
    out.providers = [...new Set(out.providers.map(normalizeProviderId).filter(Boolean))];
    out.scenarios = [...new Set(out.scenarios.length ? out.scenarios : DEFAULT_SCENARIOS)];
    return out;
}

function printUsage() {
    console.log("Run live provider tests for alpha/beta providers (v2_providers.status) using the existing harness.");
    console.log("");
    console.log("Usage:");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:provider:alpha-beta");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:provider:alpha-beta -- --statuses alpha,beta");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:provider:alpha-beta -- --provider baseten");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:provider:alpha-beta -- --scenarios chat_nonstream_hi,chat_stream_hi");
    console.log("");
    console.log("Additional flags for run-live-provider-tests.ts can be passed after '--'.");
    console.log("Example:");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:provider:alpha-beta -- -- --gateway-url http://127.0.0.1:8787/v1 --allow-transient-failures");
}

function loadLocalEnv(apiRoot: string) {
    for (const file of [".dev.vars", ".env.local", ".env"]) {
        const envPath = path.join(apiRoot, file);
        if (fs.existsSync(envPath)) dotenvConfig({ path: envPath, override: false });
    }
}

// Read-only: selects provider slugs by v2_providers.status.
async function loadCatalogProviders(statuses: Set<string>, providerFilter: Set<string>): Promise<CatalogProvider[]> {
    const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
    const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required to select providers");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
    const { data, error } = await supabase
        .from("v2_providers")
        .select("provider_slug,status")
        .in("status", [...statuses]);
    if (error) throw new Error(`Failed to load providers: ${error.message}`);

    const out = new Map<string, CatalogProvider>();
    for (const row of data ?? []) {
        const providerId = normalizeProviderId(String(row.provider_slug ?? ""));
        if (!providerId || out.has(providerId)) continue;
        if (providerFilter.size > 0 && !providerFilter.has(providerId)) continue;
        out.set(providerId, { id: providerId, status: String(row.status) });
    }
    return [...out.values()].sort((x, y) => x.id.localeCompare(y.id));
}

function runBaseLiveProviderScript(apiRoot: string, args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "pnpm",
            ["exec", "tsx", "scripts/run-live-provider-tests.ts", ...args],
            {
                cwd: apiRoot,
                env: process.env,
                stdio: "inherit",
                shell: process.platform === "win32",
            }
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

    const providers = await loadCatalogProviders(
        new Set(args.statuses.map((s) => s.toLowerCase())),
        new Set(args.providers)
    );
    if (!providers.length) {
        throw new Error(
            `No providers matched statuses=[${args.statuses.join(", ")}]` +
                (args.providers.length ? ` and providers=[${args.providers.join(", ")}]` : "")
        );
    }

    const providerIds = providers.map((row) => row.id);
    console.log(`[alpha-beta-live] selected providers (${providerIds.length}):`);
    for (const row of providers) {
        console.log(`- ${row.id} (${row.status})`);
    }
    console.log(`[alpha-beta-live] scenarios=${args.scenarios.join(",")}`);

    const forwardedArgs = [
        "--providers",
        providerIds.join(","),
        "--scenarios",
        args.scenarios.join(","),
        ...args.passThrough,
    ];
    const code = await runBaseLiveProviderScript(apiRoot, forwardedArgs);
    process.exit(code);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[alpha-beta-live] ${message}`);
    process.exit(1);
});
