import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";

type SuiteId =
    | "gpt54-nano-text"
    | "deepseek-v4-flash"
    | "embeddings-moderation"
    | "audio-images"
    | "video-batch"
    | "provider-endpoint-matrix";

type CliArgs = {
    suites: SuiteId[];
    from?: SuiteId;
    list: boolean;
    dryRun: boolean;
    continueOnFail: boolean;
};

const SUITES: Array<{
    id: SuiteId;
    script: string;
    env: Record<string, string>;
    description: string;
}> = [
    {
        id: "gpt54-nano-text",
        script: "test:live:gpt54-nano-text",
        env: {
            LIVE_RUN: "1",
            LIVE_GPT54_NANO_TEXT_RUN: "1",
        },
        description: "GPT-5.4 Nano across responses/chat/messages with stream, tools, and structured outputs",
    },
    {
        id: "embeddings-moderation",
        script: "test:live:embeddings-moderation",
        env: {
            LIVE_RUN: "1",
            LIVE_EMBEDDINGS_MODERATION_RUN: "1",
        },
        description: "OpenAI omni moderation plus Gemini Embedding 2 text and multimodal embeddings",
    },
    {
        id: "audio-images",
        script: "test:live:audio-images",
        env: {
            LIVE_RUN: "1",
            LIVE_AUDIO_IMAGES_RUN: "1",
        },
        description: "Xiaomi TTS, OpenAI transcribe/translate, and GPT Image 1 Mini",
    },
    {
        id: "deepseek-v4-flash",
        script: "test:live:deepseek-v4-flash",
        env: {
            LIVE_RUN: "1",
            LIVE_DEEPSEEK_V4_FLASH_RUN: "1",
        },
        description: "DeepSeek v4 Flash provider-pinned /responses sweep",
    },
    {
        id: "video-batch",
        script: "test:live:video-batch",
        env: {
            LIVE_RUN: "1",
            LIVE_VIDEO_BATCH_RUN: "1",
        },
        description: "Google Veo 3.1 Lite and OpenAI batch upload/create/poll/output retrieval",
    },
    {
        id: "provider-endpoint-matrix",
        script: "test:live:provider-endpoint-matrix",
        env: {
            LIVE_RUN: "1",
            LIVE_PROVIDER_ENDPOINT_MATRIX_RUN: "1",
        },
        description: "Broad supported-surface provider matrix",
    },
];

const SUITE_IDS = new Set<string>(SUITES.map((suite) => suite.id));

function parseCsv(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
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

function resolveGatewayApiKey(): string {
    const direct = normalizeEnvValue(process.env.GATEWAY_API_KEY);
    if (direct) return direct;

    const explicitGateway = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY);
    if (explicitGateway) return explicitGateway;

    const playgroundSecret = normalizeEnvValue(process.env.PLAYGROUND_KEY);
    if (!playgroundSecret) return "";

    if (looksLikeGatewayAuthToken(playgroundSecret)) return playgroundSecret;

    const kid = normalizeEnvValue(process.env.PLAYGROUND_GATEWAY_KEY_KID);
    if (!kid) return playgroundSecret;
    return `phaseo_v1_sk_${kid}_${playgroundSecret}`;
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

function isSuiteId(value: string): value is SuiteId {
    return SUITE_IDS.has(value);
}

function normalizeSuites(values: string[]): SuiteId[] {
    const out: SuiteId[] = [];
    for (const value of values) {
        if (!isSuiteId(value)) {
            throw new Error(`Unknown suite: ${value}`);
        }
        if (!out.includes(value)) out.push(value);
    }
    return out;
}

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = {
        suites: [],
        list: false,
        dryRun: false,
        continueOnFail: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const readValue = () => argv[++index];

        if (arg === "--list") {
            args.list = true;
            continue;
        }
        if (arg === "--dry-run") {
            args.dryRun = true;
            continue;
        }
        if (arg === "--continue-on-fail") {
            args.continueOnFail = true;
            continue;
        }
        if (arg === "--suite") {
            args.suites.push(...normalizeSuites(parseCsv(readValue())));
            continue;
        }
        if (arg.startsWith("--suite=")) {
            args.suites.push(...normalizeSuites(parseCsv(arg.slice("--suite=".length))));
            continue;
        }
        if (arg === "--from") {
            const value = readValue();
            if (!isSuiteId(value)) throw new Error(`Unknown suite for --from: ${value}`);
            args.from = value;
            continue;
        }
        if (arg.startsWith("--from=")) {
            const value = arg.slice("--from=".length).trim();
            if (!isSuiteId(value)) throw new Error(`Unknown suite for --from: ${value}`);
            args.from = value;
            continue;
        }
        if (arg === "--help" || arg === "-h") {
            args.list = true;
            continue;
        }
    }

    return args;
}

function orderedSuites(args: CliArgs): Array<(typeof SUITES)[number]> {
    let suites = SUITES;
    if (args.from) {
        const fromIndex = SUITES.findIndex((suite) => suite.id === args.from);
        if (fromIndex < 0) throw new Error(`Unknown --from suite: ${args.from}`);
        suites = SUITES.slice(fromIndex);
    }
    if (args.suites.length) {
        const requested = new Set(args.suites);
        suites = suites.filter((suite) => requested.has(suite.id));
    }
    return suites;
}

function printSuiteList() {
    console.log("Available live suites:");
    for (const suite of SUITES) {
        console.log(`- ${suite.id}: ${suite.description}`);
    }
    console.log("");
    console.log("Examples:");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:targeted -- --suite gpt54-nano-text");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:targeted -- --suite embeddings-moderation,audio-images");
    console.log("  pnpm --filter @phaseo/gateway-api test:live:targeted -- --from deepseek-v4-flash");
}

function runPnpmScript(cwd: string, script: string, extraEnv: Record<string, string>): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "pnpm",
            ["run", script],
            {
                cwd,
                env: {
                    ...process.env,
                    ...extraEnv,
                },
                stdio: "inherit",
                shell: process.platform === "win32",
            },
        );
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 1));
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.list) {
        printSuiteList();
        return;
    }

    const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    loadLocalEnv(apiRoot);
    const suites = orderedSuites(args);
    const gatewayApiKey = resolveGatewayApiKey();
    if (!suites.length) {
        throw new Error("No suites selected");
    }
    if (!gatewayApiKey) {
        throw new Error("Missing gateway API key. Set GATEWAY_API_KEY or playground key env vars.");
    }

    console.log(`[live-targeted-tests] selected suites=${suites.map((suite) => suite.id).join(",")}`);
    for (const suite of suites) {
        console.log(`[live-targeted-tests] ${suite.id} -> pnpm run ${suite.script}`);
        if (args.dryRun) continue;
        const exitCode = await runPnpmScript(apiRoot, suite.script, {
            ...suite.env,
            GATEWAY_API_KEY: gatewayApiKey,
        });
        if (exitCode !== 0) {
            if (!args.continueOnFail) {
                process.exit(exitCode);
            }
            console.warn(`[live-targeted-tests] ${suite.id} failed with exit code ${exitCode}; continuing`);
        }
    }
}

main().catch((error) => {
    console.error(`[live-targeted-tests] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
});
