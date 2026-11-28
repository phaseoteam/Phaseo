import { parseNumber } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";
import { xlsxRows } from "../xlsx";

const V1_PAGE = "https://os-world.github.io/";
const V1_DATA = "https://os-world.github.io/static/data/osworld_verified_results.xlsx";
const V2_PAGE = "https://osworld-v2.xlang.ai/";
const V2_DATA = "https://osworld-v2.xlang.ai/static/data/leaderboard/official-results.json";

type V2Row = {
	model: string;
	reasoning?: string;
	toolSetting?: string;
	stepBudget?: number;
	releaseVersion?: string;
	datasetScope?: string;
	binaryAccuracy?: number;
	partialScore?: number;
	outputTokensPerTask?: number;
	estimatedCostUsd?: number | null;
	official?: boolean;
	modelType?: string;
};
type V2File = { releaseVersions?: string[]; defaultResultReleaseVersion?: string; defaultResultDatasetScope?: string; defaultStepBudget?: number; updatedAt?: string; results: V2Row[] };

/**
 * OSWorld 2.0's board lists task releases side by side. "v2.1" is its own benchmark; of the dated releases we keep the
 * newest, on the full task set at the default step budget, as the site shows by default. Agent systems are skipped.
 */
export function parseOsworld2(file: V2File): SourceObservation[] {
	if (!Array.isArray(file?.results)) throw new Error("OSWorld 2.0 format changed: expected results[].");
	const budget = file.defaultStepBudget ?? 500;
	const release = (row: V2Row) => row.releaseVersion || file.defaultResultReleaseVersion || "";
	const dated = [...new Set([...(file.releaseVersions ?? []), ...file.results.map(release)])].filter((version) => /^v\d{4}\.\d{2}\.\d{2}$/.test(version)).sort();
	const boards: Record<string, string | undefined> = { "osworld-2.0": dated.at(-1), "osworld-2.1": "v2.1" };
	return Object.entries(boards).flatMap(([benchmarkId, version]) => file.results
		.filter((row) => version && release(row) === version && (row.datasetScope || file.defaultResultDatasetScope) === "full" && (row.stepBudget ?? budget) === budget && row.official !== false && row.modelType !== "agent" && typeof row.binaryAccuracy === "number")
		.map((row) => ({
			benchmarkId,
			label: row.model,
			effort: row.reasoning || undefined,
			harness: row.toolSetting || undefined,
			value: row.binaryAccuracy!,
			costUsd: typeof row.estimatedCostUsd === "number" ? row.estimatedCostUsd : undefined,
			outputTokens: typeof row.outputTokensPerTask === "number" ? row.outputTokensPerTask : undefined,
			observedOn: file.updatedAt,
			note: `Release ${version}, ${budget} steps${typeof row.partialScore === "number" ? `, partial score ${row.partialScore}%` : ""}`,
		})));
}

// "Agentic framework" rows pair a scaffold with one or more models, so they aren't one catalogue model.
const MODEL_APPROACHES = new Set(["General model", "Specialized model"]);

/** The OSWorld-Verified workbook: one row per model × step budget. The best budget per model wins in core. */
export function parseOsworldVerified(rows: string[][]): SourceObservation[] {
	const [header, ...body] = rows;
	const column = (name: string) => header?.indexOf(name) ?? -1;
	const [model, approach, steps, rate] = ["Model", "Approach type", "Max steps", "Success rate"].map(column);
	if ([model, approach, steps, rate].some((index) => index < 0)) throw new Error("OSWorld-Verified workbook columns changed.");
	return body.flatMap((row) => {
		const value = parseNumber(row[rate]);
		// "claude-opus-5[1m]": the bracket names a context setting, not a different model. It is kept as the configuration
		// so the 1M-context run isn't merged with the standard one.
		const name = row[model] ?? "";
		const setting = name.match(/\[([^\]]*)\]\s*$/)?.[1].trim();
		const label = name.replace(/\[[^\]]*\]\s*$/, "").trim();
		if (!label || value === null || !MODEL_APPROACHES.has(row[approach])) return [];
		const config = setting ? (/^\d+[km]$/i.test(setting) ? `${setting.toUpperCase()} context` : setting) : undefined;
		return [{ benchmarkId: "osworld-verified", label, ...(config ? { config } : {}), value, note: `${row[steps] || "?"} max steps` }];
	});
}

export const osworld: BenchmarkSource = {
	id: "osworld",
	name: "OSWorld",
	publisher: "XLANG Lab, University of Hong Kong",
	url: V2_PAGE,
	attribution: "OSWorld and OSWorld 2.0 by XLANG Lab (os-world.github.io, osworld-v2.xlang.ai)",
	minRows: 63,
	benchmarks: [
		{ id: "osworld-verified", name: "OSWorld-Verified", url: V1_PAGE, category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "The model operates a real Ubuntu desktop to finish 361 tasks across apps such as Chrome, LibreOffice, GIMP and VS Code. Success rate, best across the step budgets it was run with." },
		{ id: "osworld-2.0", name: "OSWorld 2.0", url: V2_PAGE, category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "The model operates a desktop computer to finish long, realistic tasks across applications. Binary accuracy (share of tasks fully completed) on the newest dated task release, full set, default step budget." },
		{ id: "osworld-2.1", name: "OSWorld 2.1", url: V2_PAGE, category: "agents", type: "percentage", higherIsBetter: true, unit: "%", description: "The v2.1 task release of OSWorld 2.0: the model operates a desktop computer to finish long, realistic tasks across applications. Binary accuracy on the full set at the default step budget." },
	],
	async fetch(ctx) {
		const [workbook, v2] = await Promise.all([
			fetch(V1_DATA, { headers: { "user-agent": "Phaseo benchmark sync (https://phaseo.app)" }, signal: AbortSignal.timeout(60_000) }).then(async (response) => {
				if (!response.ok) throw new Error(`${V1_DATA} returned ${response.status}`);
				return Buffer.from(await response.arrayBuffer());
			}),
			ctx.fetchJson<V2File>(V2_DATA),
		]);
		return [...parseOsworldVerified(xlsxRows(workbook)), ...parseOsworld2(v2)];
	},
};
