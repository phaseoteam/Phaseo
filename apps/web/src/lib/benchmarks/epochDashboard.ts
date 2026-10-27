import type { BenchmarkPage } from "@/lib/fetchers/benchmarks/types";

export type EpochMetric = "overall" | "coding" | "maths";
export type EpochDashboardRow = {
	id: string;
	name: string;
	organisation: string;
	access: "open" | "closed" | "unknown";
	date: string | null;
	modelId: string | null;
	scores: Record<EpochMetric, number | null>;
	interval: { low: number; high: number } | null;
	counts: { coding: number; maths: number };
};
export type EpochDashboardData = { rows: EpochDashboardRow[]; sourceDate: string | null; source: "epoch" | "catalogue"; domainsAvailable: boolean };

export function epochCsv(input: string): Record<string, string>[] {
	const rows: string[][] = [];
	let row: string[] = [], field = "", quoted = false;
	for (let i = 0; i < input.length; i++) {
		const c = input[i];
		if (quoted) {
			if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
			else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") { row.push(field); field = ""; }
		else if (c === "\n") { row.push(field.replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
		else field += c;
	}
	if (quoted) throw new Error("Incomplete Epoch CSV");
	if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
	const [headers = [], ...values] = rows;
	return values.map((cells) => Object.fromEntries(headers.map((key, i) => [key.replace(/^\uFEFF/, ""), cells[i] ?? ""])));
}

export function epochNumber(value: unknown): number | null {
	if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

type Observation = { performance: number; difficulty: number; slope: number };
/** Epoch's published least-squares logistic objective; bounded search avoids unstable tail gradients.
 * https://epoch.ai/data/eci-documentation/domain-specific-eci
 * Point estimates only: general-index confidence intervals must never be reused for a domain.
 */
export function fitEpochDomain(observations: Observation[]): number | null {
	if (observations.length < 2 || observations.some((o) => !Number.isFinite(o.performance) || !Number.isFinite(o.difficulty) || !Number.isFinite(o.slope) || o.slope <= 0 || o.performance < 0 || o.performance > 1)) return null;
	const loss = (value: number) => observations.reduce((sum, o) => {
		const prediction = 1 / (1 + Math.exp(Math.max(-500, Math.min(500, -o.slope * (value - o.difficulty)))));
		return sum + (Math.max(0.001, Math.min(0.999, o.performance)) - prediction) ** 2;
	}, 0);
	let best = -100, bestLoss = Infinity;
	for (let value = -100; value <= 300; value++) { const error = loss(value); if (error < bestLoss) { best = value; bestLoss = error; } }
	let low = Math.max(-100, best - 1), high = Math.min(300, best + 1);
	for (let i = 0; i < 60; i++) { const a = low + (high - low) / 3, b = high - (high - low) / 3; if (loss(a) < loss(b)) high = b; else low = a; }
	return (low + high) / 2;
}

const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
type Definition = { id?: string; title?: string; domains?: string[] };
export function buildEpochDashboard(scores: string, observations: string | null, parameters: string | null, definitions: Record<string, Definition> | null, benchmark: BenchmarkPage): EpochDashboardRow[] {
	const models = new Map<string, string[]>();
	for (const result of benchmark.results) {
		const prefix = `${result.model_id}:epoch-capabilities-index:`;
		const source = result.result_key?.startsWith(prefix) ? result.result_key.slice(prefix.length) : null;
		for (const name of source ? [source] : [result.model?.name]) if (name) models.set(name, [...new Set([...(models.get(name) ?? []), result.model_id])]);
	}
	const categories = new Map<string, string[]>();
	for (const d of Object.values(definitions ?? {})) for (const name of [d.id, d.title]) if (name) categories.set(key(name), d.domains ?? []);
	const fits = new Map((parameters ? epochCsv(parameters) : []).flatMap((p) => {
		const difficulty = epochNumber(p.edi), slope = epochNumber(p.estimated_slope_scaled);
		return difficulty !== null && slope !== null && slope > 0 ? [[p.benchmark_name, { difficulty, slope, domains: categories.get(key(p.benchmark_name)) ?? [] }] as const] : [];
	}));
	const performances = new Map<string, Map<string, number>>();
	for (const p of observations ? epochCsv(observations) : []) {
		const value = epochNumber(p.performance);
		if (!p.model || !p.benchmark || value === null || value < 0 || value > 1) continue;
		const model = performances.get(p.model) ?? new Map<string, number>();
		// Epoch aggregates the best observed performance per source model and benchmark.
		model.set(p.benchmark, Math.max(model.get(p.benchmark) ?? -Infinity, value));
		performances.set(p.model, model);
	}
	const seen = new Set<string>();
	return epochCsv(scores).flatMap((row) => {
		const overall = epochNumber(row.eci), id = row.Model?.trim();
		if (!id || overall === null) return [];
		if (seen.has(id)) throw new Error("Duplicate Epoch source model");
		seen.add(id);
		const low = epochNumber(row.eci_ci_low), high = epochNumber(row.eci_ci_high);
		const domain = (category: string) => [...(performances.get(id) ?? [])].flatMap(([name, performance]) => { const p = fits.get(name); return p?.domains.includes(category) ? [{ performance, difficulty: p.difficulty, slope: p.slope }] : []; });
		const coding = domain("Software engineering"), maths = domain("Mathematics");
		const mapped = models.get(id) ?? models.get(row["Display name"]);
		return [{ id, name: row["Display name"] || id, organisation: row.Organization || "", access: row["Accessibility group"] === "Open weights" ? "open" as const : row["Accessibility group"] === "Closed weights" ? "closed" as const : "unknown" as const,
			date: /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(Date.parse(row.date)) ? row.date : null,
			modelId: mapped?.length === 1 ? mapped[0] : null,
			scores: { overall, coding: fitEpochDomain(coding), maths: fitEpochDomain(maths) },
			interval: low !== null && high !== null && low <= overall && overall <= high ? { low, high } : null,
			counts: { coding: coding.length, maths: maths.length } }];
	});
}

/** Best score on each release date, then strictly improving records. */
export function epochFrontier(rows: EpochDashboardRow[]) {
	const dates = new Map<string, EpochDashboardRow>();
	for (const row of rows) if (row.date && row.scores.overall !== null && (!dates.has(row.date) || row.scores.overall > dates.get(row.date)!.scores.overall!)) dates.set(row.date, row);
	let best = -Infinity;
	return [...dates.values()].sort((a, b) => a.date!.localeCompare(b.date!)).filter((row) => { if (row.scores.overall! <= best) return false; best = row.scores.overall!; return true; });
}
