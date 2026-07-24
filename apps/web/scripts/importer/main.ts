import "dotenv/config";
import { isDryRun, isTransientImporterError } from "./supa";
import { ChangeTracker } from "./state";
import { cleanDeleted } from "./cleanup";
import { loadModels } from "./loaders/models";
import { loadPricing } from "./loaders/pricing";
import { loadAliases } from "./loaders/aliases";
import { loadProviders } from "./loaders/providers";
import { loadBenchmarks } from "./loaders/benchmarks";
import { loadFamilies } from "./loaders/families";
import { loadOrganisations } from "./loaders/organisations";
import { loadSubscriptionPlans } from "./loaders/subscription_plans";
import { syncV2Catalogue } from "./v2";
import { DATA_ROOT } from "./paths";

const VERBOSE = process.argv.includes("--verbose");

const getArgValue = (name: string) =>
    process.argv.find(a => a.startsWith(`${name}=`) || a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
    const modelFilter = getArgValue("model");
    const forceFull = process.argv.includes("--full");
    const forcePricing = process.argv.includes("--full-pricing") || forceFull;
    if (!modelFilter) await cleanDeleted();
    const tracker = await ChangeTracker.init(undefined, { forceFull });
    const requestedSection =
        process.argv.find(a => a.startsWith("--section="))?.split("=")[1] || "all";
    const section =
        modelFilter && (requestedSection === "all" || requestedSection === "models")
            ? "model"
            : requestedSection;

    if (modelFilter && !["model", "models", "pricing"].includes(section)) {
        console.error("The model= filter only applies to the models/pricing sections.");
        process.exit(1);
    }

    const timed = async (name: string, task: () => Promise<void>) => {
        const startedAt = performance.now();
        try {
            await task();
        } finally {
            console.log(`[importer-timing] section=${name} duration_ms=${Math.round(performance.now() - startedAt)}`);
        }
    };

    const tasks: Record<string, (tracker: ChangeTracker) => Promise<void>> = {
        families: tracker => timed("families", () => loadFamilies(tracker)),
        models: tracker => timed("models", () => loadModels(tracker, { modelId: modelFilter ?? null })),
        pricing: tracker =>
            timed("pricing", () => loadPricing(tracker, { modelId: modelFilter ?? null, forceFull: forcePricing })),
        model: async tracker => {
            await timed("models", () => loadModels(tracker, { modelId: modelFilter ?? null }));
            await timed("providers", () => loadProviders(tracker, { modelId: modelFilter ?? null }));
            await timed("pricing", () => loadPricing(tracker, {
                modelId: modelFilter ?? null,
                forceFull: forcePricing,
            }));
        },
        benchmarks: tracker => timed("benchmarks", () => loadBenchmarks(tracker)),
        organisations: tracker => timed("organisations", () => loadOrganisations(tracker)),
        providers: async tracker => {
            // Keep provider model references valid by refreshing data_models first.
            await timed("models", () => loadModels(tracker, { modelId: null }));
            await timed("providers", () => loadProviders(tracker));
        },
        aliases: tracker => timed("aliases", () => loadAliases(tracker)),
        subscription_plans: tracker => timed("subscription_plans", () => loadSubscriptionPlans(tracker)),
        all: async tracker => {
            await timed("organisations", () => loadOrganisations(tracker));
            await timed("benchmarks", () => loadBenchmarks(tracker));
            await timed("families", () => loadFamilies(tracker));
            await timed("models", () => loadModels(tracker, { modelId: null }));
            await timed("aliases", () => loadAliases(tracker));
            await timed("providers", () => loadProviders(tracker));
            await timed("pricing", () => loadPricing(tracker, { modelId: null, forceFull: forcePricing }));
            await timed("subscription_plans", () => loadSubscriptionPlans(tracker));
        },
    };
    const fn = tasks[section];
    if (!fn) {
        console.error(`Unknown section '${section}'. Use one of: ${Object.keys(tasks).join(", ")}`);
        process.exit(1);
    }

    if (isDryRun()) console.log("==================== DRY RUN (no writes) ====================");
    if (VERBOSE) console.log(`DATA_ROOT: ${DATA_ROOT}`);

    console.log(`>> Importing: ${section}`);
    if (modelFilter) console.log(`>> Model filter: ${modelFilter}`);
    if (forceFull) console.log(">> Full import mode enabled; hashes will be ignored.");
    else if (forcePricing) console.log(">> Full pricing import mode enabled.");
    await fn(tracker);
    if (modelFilter) {
        console.log(">> Skipping full v2 catalogue sync for a filtered import; run a full import to refresh the v2 mirror.");
    } else {
        await timed("v2-catalogue", () => syncV2Catalogue());
    }
    await tracker.persist({ dryRun: isDryRun() });
    console.log(">> Done.");
}

// Force the importer CLI to terminate cleanly in CI after awaited work completes.
main()
    .then(() => {
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(isTransientImporterError(err) ? 75 : 1);
    });
