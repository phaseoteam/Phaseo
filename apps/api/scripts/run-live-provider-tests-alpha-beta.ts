import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const PROVIDER_ALIASES: Record<string, string> = {
    arcee: "arcee-ai",
    "arcee-ai": "arcee-ai",
    xai: "x-ai",
    "x-ai": "x-ai",
    novita: "novitaai",
    "novita-ai": "novitaai",
};

const DEFAULT_STATUSES = ["Alpha", "Beta"];

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
    console.log("Run live provider tests for non-Ready providers (Alpha/Beta) using the existing harness.");
    console.log("");
    console.log("Usage:");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider:alpha-beta");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider:alpha-beta -- --statuses Alpha,Beta");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider:alpha-beta -- --provider baseten");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider:alpha-beta -- --scenarios chat_nonstream_hi,chat_stream_hi");
    console.log("");
    console.log("Additional flags for run-live-provider-tests.ts can be passed after '--'.");
    console.log("Example:");
    console.log("  pnpm --filter @ai-stats/gateway-api test:live:provider:alpha-beta -- -- --gateway-url http://127.0.0.1:8787/v1 --allow-transient-failures");
}

function loadCatalogProviders(
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
            const raw = fs.readFileSync(providerFile, "utf8");
            const parsed = JSON.parse(raw) as { api_provider_id?: unknown; status?: unknown };
            const providerIdRaw =
                typeof parsed.api_provider_id === "string" && parsed.api_provider_id.trim()
                    ? parsed.api_provider_id.trim()
                    : dirent.name;
            const providerId = normalizeProviderId(providerIdRaw);
            const status = typeof parsed.status === "string" ? parsed.status.trim() : "";
            if (!providerId || !status || !statuses.has(status.toLowerCase())) continue;
            if (providerFilter.size > 0 && !providerFilter.has(providerId)) continue;
            out.push({ id: providerId, status });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[alpha-beta-live] Skipping invalid provider file ${providerFile}: ${message}`);
        }
    }

    const deduped = new Map<string, CatalogProvider>();
    for (const row of out) {
        if (!deduped.has(row.id)) deduped.set(row.id, row);
    }
    return [...deduped.values()].sort((a, b) => a.id.localeCompare(b.id));
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
    const repoRoot = path.resolve(apiRoot, "..", "..");
    const catalogProvidersDir = path.join(
        repoRoot,
        "packages",
        "data",
        "catalog",
        "src",
        "data",
        "api_providers"
    );

    if (!fs.existsSync(catalogProvidersDir)) {
        throw new Error(`Catalog providers directory not found: ${catalogProvidersDir}`);
    }

    const providers = loadCatalogProviders(
        catalogProvidersDir,
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
