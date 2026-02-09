import type { CLIOptions, SimulationRun } from "./pricing-simulator-types";
import { ensureRuntimeConfigured, clearRuntime } from "./pricing-simulator-env";
import { loadCombos } from "./pricing-simulator-combos";
import { RandomSource, shuffleInPlace } from "./pricing-simulator-random";
import { loadPriceCard } from "../src/pipeline/pricing/loader";
import { computeBillSummary } from "../src/pipeline/pricing/engine";
import { parseUsdToNanos, formatUsdFromNanosExact } from "../src/pipeline/pricing/money";
import { computeRuleSummaries, generateUsageAndContext, estimateCostFromRules } from "./pricing-simulator-pricing-utils";
import { withPricingDebug } from "./pricing-simulator-debug";
import { isFlaggedDiff } from "./pricing-simulator-formatting";

export async function simulate(options: CLIOptions): Promise<SimulationRun[]> {
    ensureRuntimeConfigured();
    try {
        const combos = await loadCombos(options);

        if (!combos.length) {
            throw new Error("No provider/model combinations matched your filters.");
        }

        const random = new RandomSource(options.seed);
        if (options.randomize) shuffleInPlace(combos, random);

        const selected = combos.slice(0, Number.isFinite(options.limit) ? options.limit : combos.length);
        const runs: SimulationRun[] = [];

        for (const combo of selected) {
            const card = await loadPriceCard(combo.provider, combo.model, combo.endpoint);
            if (!card) continue;

            const planSet = new Set<string>(card.rules.map((r) => r.pricing_plan || "standard"));
            const plansToSimulate =
                options.plan === "all"
                    ? Array.from(planSet).sort()
                    : planSet.has(options.plan)
                        ? [options.plan]
                        : [];

            for (const plan of plansToSimulate) {
                const summaries = computeRuleSummaries(card, plan);
                if (!summaries.length) continue;

                for (let i = 0; i < options.runs; i++) {
                    const { usage, context } = generateUsageAndContext(summaries, options, random);
                    const usagePayload = { ...context, ...usage };
                    const summary = withPricingDebug(options.debug, () => computeBillSummary(usagePayload, card, context, plan));
                    const estimation = estimateCostFromRules(usage, context, card, plan);
                    const summaryTotalNanos = summary.lines.reduce(
                        (sum, line) => sum + (line.line_nanos ?? parseUsdToNanos(line.line_cost_usd)),
                        0
                    );
                    const diffNanos = summaryTotalNanos - estimation.totalNanos;
                    const diffUsd = diffNanos / 1_000_000_000;
                    const flagged = isFlaggedDiff(diffUsd);
                    const engineTotalUsdStr = formatUsdFromNanosExact(summaryTotalNanos);
                    const engineTotalUsd = summaryTotalNanos / 1_000_000_000;
                    if (!options.debug && flagged) {
                        withPricingDebug(true, () => computeBillSummary(usagePayload, card, context, plan));
                    }
                    if (options.debug || flagged) {
                        const candidateRules = card.rules
                            .filter((r) => r.pricing_plan === plan)
                            .map((r) => ({
                                id: r.id,
                                meter: r.meter,
                                price_per_unit: r.price_per_unit,
                                unit_size: r.unit_size,
                                priority: r.priority,
                                match: r.match,
                            }));
                        console.log(
                            JSON.stringify(
                                {
                                    tag: "pricing-debug-run",
                                    combo,
                                    plan,
                                    usage,
                                    context,
                                    estimation: {
                                        totalUsd: estimation.totalUsd,
                                        totalUsdStr: estimation.totalUsdStr,
                                        totalNanos: estimation.totalNanos,
                                        lines: estimation.lines,
                                    },
                                    engine: {
                                        totalUsd: engineTotalUsd,
                                        totalUsdStr: engineTotalUsdStr,
                                        totalNanos: summaryTotalNanos,
                                        lines: summary.lines,
                                    },
                                    diffUsd,
                                    diffNanos,
                                    ruleSummaries: estimation.ruleSummaries,
                                    candidateRules,
                                },
                                null,
                                2,
                            ),
                        );
                    }
                    runs.push({
                        combo,
                        plan,
                        usage,
                        context,
                        card,
                        engineTotalUsd,
                        engineTotalUsdStr,
                        engineTotalNanos: summaryTotalNanos,
                        diffUsd,
                        diffNanos,
                        estimation,
                        breakdown: summary.lines,
                    });
                }
            }
        }

        if (!runs.length) {
            throw new Error("Price cards could not be loaded for the selected combinations.");
        }

        runs.sort((a, b) => {
            const providerDiff = a.combo.provider.localeCompare(b.combo.provider);
            if (providerDiff !== 0) return providerDiff;
            const modelDiff = a.combo.model.localeCompare(b.combo.model);
            if (modelDiff !== 0) return modelDiff;
            const endpointDiff = a.combo.endpoint.localeCompare(b.combo.endpoint);
            if (endpointDiff !== 0) return endpointDiff;
            return a.plan.localeCompare(b.plan);
        });

        return runs;
    } finally {
        clearRuntime();
    }
}

