import type { CLIOptions, Endpoint } from "./pricing-simulator-types";
import { DEFAULT_OPTIONS } from "./pricing-simulator-constants";

function parseArgv(argv: string[]): CLIOptions {
    const opts: CLIOptions = { ...DEFAULT_OPTIONS };

    const listArg = (value?: string) =>
        value
            ? value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean)
            : undefined;

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => argv[++i];

        switch (arg) {
            case "--provider":
            case "-p":
                opts.provider = listArg(next());
                break;
            case "--model":
            case "-m":
                opts.model = listArg(next());
                break;
            case "--endpoint":
            case "-e":
                opts.endpoint = next() as Endpoint;
                break;
            case "--limit":
            case "-l":
                opts.limit = Number(next() ?? opts.limit);
                break;
            case "--runs":
            case "-r":
                opts.runs = Number(next() ?? opts.runs);
                break;
            case "--plan":
                opts.plan = (next() ?? opts.plan).trim();
                break;
            case "--min":
                opts.min = Number(next() ?? opts.min);
                break;
            case "--max":
                opts.max = Number(next() ?? opts.max);
                break;
            case "--seed":
                opts.seed = Number(next() ?? opts.seed);
                break;
            case "--random":
                opts.randomize = true;
                break;
            case "--verbose":
            case "-v":
                opts.verbose = true;
                break;
            case "--all":
                opts.limit = Number.POSITIVE_INFINITY;
                break;
            case "--debug":
                opts.debug = true;
                break;
            case "--include-inactive":
                opts.includeInactive = true;
                break;
            case "--help":
            case "-h":
                printHelpAndExit();
                break;
            default:
                if (arg.startsWith("--")) {
                    throw new Error(`Unknown flag: ${arg}`);
                }
        }
    }

    if (Number.isNaN(opts.limit) || opts.limit <= 0) opts.limit = DEFAULT_OPTIONS.limit;
    if (Number.isNaN(opts.runs) || opts.runs <= 0) opts.runs = DEFAULT_OPTIONS.runs;
    if (Number.isNaN(opts.min) || opts.min < 0) opts.min = DEFAULT_OPTIONS.min;
    if (Number.isNaN(opts.max) || opts.max < opts.min) opts.max = Math.max(DEFAULT_OPTIONS.max, opts.min + 1);
    if (Number.isNaN(opts.seed)) opts.seed = DEFAULT_OPTIONS.seed;
    if (!opts.plan || opts.plan.toLowerCase() === "all") {
        opts.plan = "all";
    }

    return opts;
}

function printHelpAndExit(): never {
    console.log(
        [
            "Usage: pnpm simulate:pricing [options]",
            "",
            "Options:",
            "  -p, --provider <name[,name...]>   Restrict to specific provider(s)",
            "  -m, --model <model[,model...]>    Restrict to specific model id(s)",
            "  -e, --endpoint <endpoint>         Restrict to a specific endpoint",
            "  -l, --limit <number>              Limit number of model/provider combos (default 5)",
            "  -r, --runs <number>               Random usage runs per combo (default 1)",
            "      --plan <pricingPlan>          Pricing plan to simulate (default \"all\" for every plan)",
            "      --min <number>                Minimum random meter quantity (default 10)",
            "      --max <number>                Maximum random meter quantity (default 5000)",
            "      --seed <number>               Seed for deterministic randomness (default Date.now())",
            "      --random                      Shuffle combos before sampling",
            "  -v, --verbose                     Print breakdown per combo",
            "      --all                         Simulate every available combo (ignores limit)",
            "      --include-inactive            Include inactive provider models",
            "  -h, --help                        Show this help message",
        ].join("\n"),
    );
    process.exit(0);
}

export { parseArgv, printHelpAndExit };
