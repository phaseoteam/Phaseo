#!/usr/bin/env node
import process from "node:process";
import { createTable } from "@visulima/tabular";
import { parseArgv } from "./pricing-simulator-cli";
import { simulateEach } from "./pricing-simulator-simulation";
import type { SimulationRun, TabularTable } from "./pricing-simulator-types";

const LOG_PREFIX = "[pricing-test]";
const DEFAULT_RUNS_PER_COMBO = 100;
const MAX_COMBO_REPORT = 10000;

type ComboAggregate = {
    combo: SimulationRun["combo"];
    plan: string;
    totalRuns: number;
    successfulRuns: number;
    zeroBillRuns: number;
    mismatchRuns: number;
    tokensTested: number;
};

type ModelAggregate = {
    model: string;
    providers: Set<string>;
    combos: Set<string>;
    totalRuns: number;
    successfulRuns: number;
    zeroBillRuns: number;
    mismatchRuns: number;
    tokensTested: number;
};

const TOTAL_TOKEN_KEYS = ["total_tokens", "total_text_tokens", "total_input_output_tokens", "usage_tokens_total"];
const INPUT_TOKEN_KEYS = [
    "input_text_tokens",
    "input_tokens",
    "prompt_tokens",
    "cached_read_text_tokens",
    "reasoning_tokens",
];
const OUTPUT_TOKEN_KEYS = ["output_text_tokens", "output_tokens", "completion_tokens", "cached_write_text_tokens"];

function comboKey(run: SimulationRun): string {
    return `${run.combo.provider}/${run.combo.model}/${run.combo.endpoint}/${run.plan}`;
}

function formatPercent(part: number, whole: number): string {
    if (!whole) return "0.0000%";
    return `${((part / whole) * 100).toFixed(4)}%`;
}

function extractTokenCount(run: SimulationRun): number {
    const usage = run.usage ?? {};
    const pickNumber = (keys: string[]): number | null => {
        for (const key of keys) {
            const value = usage[key];
            if (typeof value === "number" && Number.isFinite(value)) {
                return value;
            }
        }
        return null;
    };

    const total = pickNumber(TOTAL_TOKEN_KEYS);
    if (total !== null) return total;

    const input = pickNumber(INPUT_TOKEN_KEYS) ?? 0;
    const output = pickNumber(OUTPUT_TOKEN_KEYS) ?? 0;
    if (input || output) return input + output;

    let sum = 0;
    for (const [key, value] of Object.entries(usage)) {
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        if (key.toLowerCase().includes("token")) {
            sum += value;
        }
    }
    if (sum > 0) return sum;

    for (const line of run.estimation.lines) {
        if (line.meter.toLowerCase().includes("token")) {
            sum += line.quantity;
        }
    }

    return sum;
}

function renderTable(headers: string[], rows: Array<Array<string | number>>): string {
    if (!rows.length) return "  (no data)";
    const table = createTable({
        showHeader: true,
        wordWrap: true,
        style: { paddingLeft: 1, paddingRight: 1 },
        maxWidth: 200,
    }) as TabularTable;
    table.setHeaders(headers);
    for (const row of rows) {
        table.addRow(row);
    }
    return table.toString();
}

function renderModelSummary(models: ModelAggregate[]): string {
    const rows = models.map((model) => [
        model.model,
        Array.from(model.providers).sort().join(", "),
        model.combos.size,
        model.totalRuns.toLocaleString(),
        formatPercent(model.successfulRuns, model.totalRuns),
        model.zeroBillRuns.toLocaleString(),
        model.mismatchRuns.toLocaleString(),
        model.tokensTested.toLocaleString(),
    ]);
    return renderTable(["Model", "Providers", "Combos", "Runs", "Success %", "Zero-Bill", "Mismatch", "Tokens Tested"], rows);
}

function renderComboIssues(entries: ComboAggregate[]): string {
    const rows = entries.map((entry) => [
        entry.combo.provider,
        entry.combo.model,
        entry.combo.endpoint,
        entry.plan,
        entry.totalRuns.toLocaleString(),
        formatPercent(entry.successfulRuns, entry.totalRuns),
        entry.zeroBillRuns.toLocaleString(),
        entry.mismatchRuns.toLocaleString(),
        entry.tokensTested.toLocaleString(),
    ]);
    return renderTable(
        ["Provider", "Model", "Endpoint", "Plan", "Runs", "Success %", "Zero-Bill", "Mismatch", "Tokens Tested"],
        rows,
    );
}

async function main() {
    const argv = process.argv.slice(2);
    const options = parseArgv(argv);
    const hasRunsFlag = argv.includes("--runs") || argv.includes("-r");
    if (!hasRunsFlag) {
        options.runs = DEFAULT_RUNS_PER_COMBO;
    }

    console.log(
        `${LOG_PREFIX} Running pricing harness with limit=${Number.isFinite(options.limit) ? options.limit : "all"} and ${options.runs.toLocaleString()} runs per provider/model/endpoint/plan.`,
    );

    const comboAggregates = new Map<string, ComboAggregate>();
    const modelAggregates = new Map<string, ModelAggregate>();

    let totalRuns = 0;
    let totalSuccesses = 0;
    let totalZeroBill = 0;
    let totalMismatches = 0;
    let totalTokensTested = 0;

    await simulateEach(options, (run) => {
        const key = comboKey(run);
        let comboAggregate = comboAggregates.get(key);
        if (!comboAggregate) {
            comboAggregate = {
                combo: run.combo,
                plan: run.plan,
                totalRuns: 0,
                successfulRuns: 0,
                zeroBillRuns: 0,
                mismatchRuns: 0,
                tokensTested: 0,
            };
            comboAggregates.set(key, comboAggregate);
        }

        let modelAggregate = modelAggregates.get(run.combo.model);
        if (!modelAggregate) {
            modelAggregate = {
                model: run.combo.model,
                providers: new Set([run.combo.provider]),
                combos: new Set([key]),
                totalRuns: 0,
                successfulRuns: 0,
                zeroBillRuns: 0,
                mismatchRuns: 0,
                tokensTested: 0,
            };
            modelAggregates.set(run.combo.model, modelAggregate);
        } else {
            modelAggregate.providers.add(run.combo.provider);
            modelAggregate.combos.add(key);
        }

        const tokensThisRun = extractTokenCount(run);
        comboAggregate.totalRuns += 1;
        comboAggregate.tokensTested += tokensThisRun;
        modelAggregate.totalRuns += 1;
        modelAggregate.tokensTested += tokensThisRun;

        totalRuns += 1;
        totalTokensTested += tokensThisRun;

        const matchesEstimate = run.engineTotalNanos === run.estimation.totalNanos;
        const expectedZero = run.estimation.totalNanos === 0;
        const billedNonZero = run.engineTotalNanos > 0;
        const runSucceeded = matchesEstimate && (billedNonZero || expectedZero);

        if (runSucceeded) {
            comboAggregate.successfulRuns += 1;
            modelAggregate.successfulRuns += 1;
            totalSuccesses += 1;
            return;
        }

        if (!billedNonZero) {
            comboAggregate.zeroBillRuns += 1;
            modelAggregate.zeroBillRuns += 1;
            totalZeroBill += 1;
        }

        if (!matchesEstimate) {
            comboAggregate.mismatchRuns += 1;
            modelAggregate.mismatchRuns += 1;
            totalMismatches += 1;
        }
    });

    console.log(
        `${LOG_PREFIX} Completed ${totalRuns.toLocaleString()} simulation runs across ${comboAggregates.size} combo(s).`,
    );
    console.log(
        `${LOG_PREFIX} Successful runs: ${totalSuccesses.toLocaleString()} (${formatPercent(totalSuccesses, totalRuns)}).`,
    );
    if (totalZeroBill) {
        console.log(
            `${LOG_PREFIX} Runs with zero billed amount: ${totalZeroBill.toLocaleString()} (${formatPercent(
                totalZeroBill,
                totalRuns,
            )}).`,
        );
    }
    if (totalMismatches) {
        console.log(
            `${LOG_PREFIX} Runs with billed/estimated mismatch: ${totalMismatches.toLocaleString()} (${formatPercent(
                totalMismatches,
                totalRuns,
            )}).`,
        );
    }
    console.log(`${LOG_PREFIX} Total tokens exercised: ${totalTokensTested.toLocaleString()}.`);

    const modelSummary = Array.from(modelAggregates.values()).sort((a, b) => b.tokensTested - a.tokensTested);
    if (modelSummary.length) {
        console.log(`${LOG_PREFIX} Model coverage summary:\n${renderModelSummary(modelSummary)}`);
    }

    const failingCombos = Array.from(comboAggregates.values()).filter((entry) => entry.successfulRuns !== entry.totalRuns);

    if (!failingCombos.length) {
        console.log(
            `${LOG_PREFIX} All combos satisfied the criteria (non-zero billed amount and perfect estimation match).`,
        );
        process.exit(0);
    }

    failingCombos.sort((a, b) => {
        const aRate = a.successfulRuns / a.totalRuns;
        const bRate = b.successfulRuns / b.totalRuns;
        if (aRate !== bRate) return aRate - bRate;
        return b.totalRuns - a.totalRuns;
    });

    console.log(
        `${LOG_PREFIX} Combos with issues (${failingCombos.length} of ${comboAggregates.size}): showing up to ${MAX_COMBO_REPORT}.`,
    );

    const issueTable = renderComboIssues(failingCombos.slice(0, MAX_COMBO_REPORT));
    console.log(issueTable);

    console.log(
        `${LOG_PREFIX} See above for problematic combos. The harness exited with code 1 to signal a failure was detected.`,
    );
    process.exit(1);
}

main().catch((err) => {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`${LOG_PREFIX} Failed to execute pricing harness: ${error.message}`);
    process.exit(1);
});
