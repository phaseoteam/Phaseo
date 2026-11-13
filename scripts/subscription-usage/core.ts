/**
 * Matching and change detection for the subscription usage sync.
 *
 * Source: the real-api-pricing dataset (derived/points.csv), which records how many tokens a
 * subscription plan allows per month for each model, measured by saturating the plan.
 */

export const SOURCE_NAME = "real-api-pricing";
export const SOURCE_URL = "https://github.com/FeiZhuLulu/real-api-pricing";
export const SOURCE_CSV_URL = "https://raw.githubusercontent.com/FeiZhuLulu/real-api-pricing/main/derived/points.csv";

export type Scenario = "standard" | "peak" | "off_peak" | "fast";

/**
 * Source plan id → our plan_id. Only plans whose price and tier match one of ours 1:1 are listed;
 * resellers and regional (CN-priced) plans we don't catalogue are left out on purpose.
 */
export const PLAN_MAP: Record<string, { planId: string; scenario: Scenario }> = {
	chatgpt_plus: { planId: "chatgpt-plus", scenario: "standard" },
	chatgpt_pro_10x: { planId: "chatgpt-pro", scenario: "standard" },
	chatgpt_pro_20x: { planId: "chatgpt-pro-20x", scenario: "standard" },
	claude_pro: { planId: "claude-pro", scenario: "standard" },
	claude_max_5x: { planId: "claude-max-5x", scenario: "standard" },
	claude_max_20x: { planId: "claude-max-20x", scenario: "standard" },
	claude_team: { planId: "claude-team-premium", scenario: "standard" },
	google_ai_pro_us: { planId: "google-ai-pro", scenario: "standard" },
	google_ai_ultra_5x_us: { planId: "google-ai-ultra", scenario: "standard" },
	google_ai_ultra_20x_us: { planId: "google-ai-ultra-20x", scenario: "standard" },
	cursor_pro: { planId: "cursor-pro", scenario: "standard" },
	cursor_pro_plus: { planId: "cursor-pro-plus", scenario: "standard" },
	cursor_ultra: { planId: "cursor-ultra", scenario: "standard" },
	cursor_pro_composer_fast: { planId: "cursor-pro", scenario: "fast" },
	cursor_pro_plus_composer_fast: { planId: "cursor-pro-plus", scenario: "fast" },
	cursor_ultra_composer_fast: { planId: "cursor-ultra", scenario: "fast" },
	cursor_ultra_fast: { planId: "cursor-ultra", scenario: "fast" },
	minimax_token_plus_global: { planId: "minimax-token-plus", scenario: "standard" },
	minimax_token_max_global: { planId: "minimax-token-max", scenario: "standard" },
	minimax_token_ultra_global: { planId: "minimax-token-ultra", scenario: "standard" },
	mimo_token_lite_day: { planId: "xiaomi-mimo-lite", scenario: "standard" },
	mimo_token_lite_night: { planId: "xiaomi-mimo-lite", scenario: "off_peak" },
	mimo_token_standard_day: { planId: "xiaomi-mimo-standard", scenario: "standard" },
	mimo_token_standard_night: { planId: "xiaomi-mimo-standard", scenario: "off_peak" },
	mimo_token_pro_day: { planId: "xiaomi-mimo-pro", scenario: "standard" },
	mimo_token_pro_night: { planId: "xiaomi-mimo-pro", scenario: "off_peak" },
	mimo_token_max_day: { planId: "xiaomi-mimo-max", scenario: "standard" },
	mimo_token_max_night: { planId: "xiaomi-mimo-max", scenario: "off_peak" },
};

/** Source vendor → our lab prefix. */
export const VENDOR_PREFIX: Record<string, string> = {
	OpenAI: "openai", Anthropic: "anthropic", Google: "google", Cursor: "cursor", MiniMax: "minimax", Xiaomi: "xiaomi",
	SpaceXAI: "spacex-ai", Kimi: "moonshotai", Zhipu: "z-ai", Alibaba: "qwen", DeepSeek: "deepseek", Muse: "meta",
	StepFun: "stepfun", Tencent: "tencent", Meituan: "meituan", inclusionAI: "inclusionai", Mistral: "mistral",
};

/** Source model ids whose catalogue slug isn't `<prefix>/<id>`. */
export const MODEL_OVERRIDES: Record<string, string> = {
	"muse-wonder": "meta/muse-wonder-1.0",
};

export type SourcePoint = {
	id: string; planId: string; model: string; vendor: string; billing: string; priceUsd: number | null;
	monthlyTokens: number | null; confidence: string; workload: string; dataDateKind: string; dataDate: string;
	listBlendedUsdPerMtok: number | null; promoUntil: string | null; unmetered: boolean; source: string; note: string;
};

export function parseCsv(text: string): Record<string, string>[] {
	const input = text.replace(/^﻿/, "");
	const rows: string[][] = [];
	let row: string[] = [], field = "", quoted = false;
	for (let index = 0; index < input.length; index++) {
		const char = input[index];
		if (quoted) {
			if (char === '"') { if (input[index + 1] === '"') { field += '"'; index++; } else quoted = false; } else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ",") { row.push(field); field = ""; }
		else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
		else if (char !== "\r") field += char;
	}
	if (field || row.length) { row.push(field); rows.push(row); }
	const header = rows.shift() ?? [];
	return rows.filter((cells) => cells.length === header.length).map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index]])));
}

const number = (value: string | undefined) => {
	if (value === undefined || value.trim() === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
};

export function parsePoints(text: string): SourcePoint[] {
	return parseCsv(text).map((row) => {
		const yi = number(row.monthly_yi);
		return {
			id: row.id, planId: row.id.split("::")[0], model: row.model, vendor: row.vendor, billing: row.billing,
			priceUsd: number(row.price_usd), monthlyTokens: yi === null ? null : Math.round(yi * 1e8),
			confidence: row.confidence, workload: row.workload, dataDateKind: row.data_date_kind, dataDate: row.data_date,
			listBlendedUsdPerMtok: number(row.list_blended_usd_per_mtok), promoUntil: /^\d{4}-\d{2}-\d{2}$/.test(row.promo_until ?? "") ? row.promo_until : null,
			unmetered: row.unmetered === "True", source: row.source ?? "", note: row.note ?? "",
		};
	});
}

export type CataloguePlan = { plan_uuid: string; plan_id: string; price: number | null };
export type UsageRow = {
	plan_uuid: string; model_slug: string; scenario: Scenario; monthly_tokens: number; workload: "measured" | "standard_mix" | "unknown";
	basis: "measured" | "derived" | "official" | "assumed" | "unknown"; confidence: "high" | "medium" | "low" | "assumed";
	plan_price_usd: number | null; api_equivalent_usd_per_mtok: number | null; source_name: string; source_record_id: string;
	source_url: string; note: string | null; measured_on: string | null; promo_until: string | null;
	metadata: Record<string, unknown>;
};
export type Skipped = { id: string; reason: string };

export function modelSlugFor(point: Pick<SourcePoint, "vendor" | "model">, slugs: ReadonlySet<string>): string | null {
	const override = MODEL_OVERRIDES[point.model];
	if (override) return slugs.has(override) ? override : null;
	const prefix = VENDOR_PREFIX[point.vendor];
	if (!prefix) return null;
	const slug = `${prefix}/${point.model.toLowerCase()}`;
	return slugs.has(slug) ? slug : null;
}

const CONFIDENCE = new Set(["high", "medium", "low"]);

/** Turn source points into rows for our catalogue, with a reason for every point left out. */
export function buildUsageRows(points: SourcePoint[], plans: CataloguePlan[], slugs: ReadonlySet<string>) {
	const planById = new Map(plans.map((plan) => [plan.plan_id, plan]));
	const rows = new Map<string, UsageRow>();
	const skipped: Skipped[] = [];
	const priceMismatches: { id: string; sourcePrice: number; ourPrice: number }[] = [];
	for (const point of points) {
		if (point.billing !== "subscription") continue;
		const mapping = PLAN_MAP[point.planId];
		if (!mapping) { skipped.push({ id: point.id, reason: "plan not mapped" }); continue; }
		const plan = planById.get(mapping.planId);
		if (!plan) { skipped.push({ id: point.id, reason: `plan ${mapping.planId} not in catalogue` }); continue; }
		if (point.unmetered || !point.monthlyTokens || point.monthlyTokens <= 0) { skipped.push({ id: point.id, reason: "no measured token volume" }); continue; }
		const modelSlug = modelSlugFor(point, slugs);
		if (!modelSlug) { skipped.push({ id: point.id, reason: `model ${point.vendor}/${point.model} not in catalogue` }); continue; }
		if (point.priceUsd !== null && plan.price !== null && plan.price > 0 && Math.abs(point.priceUsd - plan.price) / plan.price > 0.05) {
			priceMismatches.push({ id: point.id, sourcePrice: point.priceUsd, ourPrice: plan.price });
		}
		const key = `${plan.plan_uuid}|${modelSlug}|${mapping.scenario}`;
		if (rows.has(key)) { skipped.push({ id: point.id, reason: `duplicate of ${rows.get(key)!.source_record_id}` }); continue; }
		rows.set(key, {
			plan_uuid: plan.plan_uuid, model_slug: modelSlug, scenario: mapping.scenario, monthly_tokens: point.monthlyTokens,
			workload: point.workload === "measured" ? "measured" : point.workload ? "standard_mix" : "unknown",
			basis: point.dataDateKind === "sample" ? "measured" : point.dataDateKind === "derived" ? "derived" : point.dataDateKind === "official" ? "official" : "unknown",
			confidence: CONFIDENCE.has(point.confidence) ? point.confidence as UsageRow["confidence"] : "assumed",
			plan_price_usd: point.priceUsd, api_equivalent_usd_per_mtok: point.listBlendedUsdPerMtok && point.listBlendedUsdPerMtok > 0 ? point.listBlendedUsdPerMtok : null,
			source_name: SOURCE_NAME, source_record_id: point.id, source_url: SOURCE_URL,
			note: point.note || null, measured_on: point.dataDate || null, promo_until: point.promoUntil,
			metadata: { workload_profile: point.workload || null, source_label: point.source || null },
		});
	}
	return { rows: [...rows.values()], skipped, priceMismatches };
}

export type CurrentRow = UsageRow & { usage_uuid: string };
const COMPARED: (keyof UsageRow)[] = ["monthly_tokens", "workload", "basis", "confidence", "plan_price_usd", "api_equivalent_usd_per_mtok", "source_record_id", "measured_on", "promo_until"];
const same = (a: unknown, b: unknown) => (a === null || a === undefined ? null : typeof a === "number" || typeof b === "number" ? Number(a) : String(a)) === (b === null || b === undefined ? null : typeof a === "number" || typeof b === "number" ? Number(b) : String(b));

/**
 * Compare incoming rows with the current ones for this source. Unchanged rows are left alone so the
 * catalogue history only records real changes; changed rows are closed and re-inserted; rows the source
 * no longer lists are closed.
 */
export function diffUsage(current: CurrentRow[], incoming: UsageRow[]) {
	const key = (row: Pick<UsageRow, "plan_uuid" | "model_slug" | "scenario">) => `${row.plan_uuid}|${row.model_slug}|${row.scenario}`;
	const currentByKey = new Map(current.map((row) => [key(row), row]));
	const insert: UsageRow[] = [], close: string[] = [];
	let unchanged = 0;
	for (const row of incoming) {
		const existing = currentByKey.get(key(row));
		currentByKey.delete(key(row));
		if (!existing) { insert.push(row); continue; }
		if (COMPARED.every((field) => same(existing[field], row[field]))) { unchanged++; continue; }
		close.push(existing.usage_uuid);
		insert.push(row);
	}
	const removed = [...currentByKey.values()].map((row) => row.usage_uuid);
	return { insert, close, removed, unchanged };
}
