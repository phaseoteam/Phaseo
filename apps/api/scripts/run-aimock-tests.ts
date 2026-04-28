import { spawn } from "node:child_process";

type CliArgs = {
    providers: string[];
    scenarios: string[];
    record: boolean;
    proxyOnly: boolean;
    vitestArgs: string[];
};

function parseCsv(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function parseArgs(argv: string[]): CliArgs {
    const out: CliArgs = {
        providers: [],
        scenarios: [],
        record: false,
        proxyOnly: false,
        vitestArgs: [],
    };

    const passthroughIndex = argv.indexOf("--");
    const args = passthroughIndex >= 0 ? argv.slice(0, passthroughIndex) : argv;
    out.vitestArgs = passthroughIndex >= 0 ? argv.slice(passthroughIndex + 1) : [];

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (!arg) continue;
        const nextValue = () => args[++i];

        if (arg === "--record") {
            out.record = true;
            continue;
        }
        if (arg === "--proxy-only") {
            out.proxyOnly = true;
            continue;
        }
        if (arg === "--provider") {
            out.providers.push(...parseCsv(nextValue()));
            continue;
        }
        if (arg.startsWith("--provider=")) {
            out.providers.push(...parseCsv(arg.slice("--provider=".length)));
            continue;
        }
        if (arg === "--scenario") {
            out.scenarios.push(...parseCsv(nextValue()));
            continue;
        }
        if (arg.startsWith("--scenario=")) {
            out.scenarios.push(...parseCsv(arg.slice("--scenario=".length)));
            continue;
        }

        out.vitestArgs.push(arg);
    }

    return out;
}

function runVitest(env: NodeJS.ProcessEnv, args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
        const command =
            process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "pnpm";
        const child = spawn(
            command,
            process.platform === "win32"
                ? ["/d", "/s", "/c", "pnpm exec vitest run tests/aimock", ...args]
                : ["exec", "vitest", "run", "tests/aimock", ...args],
            {
                cwd: process.cwd(),
                env,
                stdio: "inherit",
            },
        );
        child.on("error", reject);
        child.on("exit", (code) => resolve(code ?? 1));
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (!args.vitestArgs.some((arg) => arg.startsWith("--fileParallelism"))) {
        args.vitestArgs.unshift("--fileParallelism=false");
    }
    if (!args.vitestArgs.some((arg) => arg.startsWith("--passWithNoTests"))) {
        args.vitestArgs.unshift("--passWithNoTests");
    }
    const env: NodeJS.ProcessEnv = {
        ...process.env,
    };

    if (args.providers.length) {
        env.AISTATS_AIMOCK_PROVIDERS = args.providers.join(",");
    }
    if (args.scenarios.length) {
        env.AISTATS_AIMOCK_SCENARIOS = args.scenarios.join(",");
    }
    if (args.record) {
        env.AISTATS_AIMOCK_RECORD = "1";
    }
    if (args.proxyOnly) {
        env.AISTATS_AIMOCK_PROXY_ONLY = "1";
    }

    const exitCode = await runVitest(env, args.vitestArgs);
    process.exit(exitCode);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[aimock-tests] ${message}`);
    process.exit(1);
});
