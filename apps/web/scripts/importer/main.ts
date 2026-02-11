import "dotenv/config";
import { isDryRun } from "./supa";
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
import { DATA_ROOT } from "./paths";

const VERBOSE = process.argv.includes("--verbose");

const getArgValue = (name: string) =>
    process.argv.find(a => a.startsWith(`${name}=`) || a.startsWith(`--${name}=`))?.split("=")[1];

async function main() {
    const modelFilter = getArgValue("model");
    const forcePricing = process.argv.includes("--full-pricing") || process.argv.includes("--full");
    if (!modelFilter) await cleanDeleted();
    const tracker = await ChangeTracker.init();
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

    const tasks: Record<string, (tracker: ChangeTracker) => Promise<void>> = {
        families: loadFamilies,
        models: tracker => loadModels(tracker, { modelId: modelFilter ?? null }),
        pricing: tracker =>
            loadPricing(tracker, { modelId: modelFilter ?? null, forceFull: forcePricing }),
        model: async tracker => {
            await loadModels(tracker, { modelId: modelFilter ?? null });
            await loadProviders(tracker, { modelId: modelFilter ?? null });
            await loadPricing(tracker, {
                modelId: modelFilter ?? null,
                forceFull: forcePricing,
            });
        },
        benchmarks: loadBenchmarks,
        organisations: loadOrganisations,
        providers: loadProviders,
        aliases: loadAliases,
        subscription_plans: loadSubscriptionPlans,
        all: async tracker => {
            await loadOrganisations(tracker);
            await loadBenchmarks(tracker);
            await loadFamilies(tracker);
            await loadModels(tracker, { modelId: null });
            await loadAliases(tracker); // optional: if you have the aliases loader
            await loadProviders(tracker);
            await loadPricing(tracker, { modelId: null, forceFull: forcePricing });
            await loadSubscriptionPlans(tracker);
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
    if (forcePricing) console.log(">> Full pricing import mode enabled.");
    await fn(tracker);
    await tracker.persist({ dryRun: isDryRun() });
    console.log(">> Done.");
}

main().catch(err => { console.error(err); process.exit(1); });
