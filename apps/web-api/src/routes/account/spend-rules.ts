// Generated from packages/shared/spend-rules/index.ts by scripts/sync-spend-rules.mjs. Do not edit.
// Spend rules: thresholds in $ or % over a scope and a period that notify, or notify and then
// block. This is the one definition of a valid rule as the API accepts it and of how a rule is
// returned. It repeats every CHECK on public.workspace_spend_rules with a readable message, so a
// bad request gets a clear 400 before the database is asked; the table's constraints and
// trigger still decide. The control API, the settings API (web-api) and the settings page each
// use a generated copy (scripts/sync-spend-rules.mjs), which also checks the lists below against
// the table and the evaluator. Keep it dependency-free.

export const MAX_SPEND_RULES_PER_WORKSPACE = 50;
export const MAX_SPEND_RULE_DESTINATIONS = 50;
export const MAX_SPEND_RULE_THRESHOLDS = 5;
export const SPEND_RULE_TEST_SENDS_PER_MINUTE = 5;
export const DEFAULT_SPIKE_MULTIPLIER = 3;
export const DEFAULT_SPIKE_FLOOR_NANOS = 5_000_000_000;
export const DEFAULT_BLOCK_AT_PERCENT = 110;
export const DEFAULT_COOLDOWN_MINUTES = 360;
export const MAX_SPEND_RULE_HISTORY_PAGE = 100;
export const DEFAULT_SPEND_RULE_HISTORY_PAGE = 50;

export const SPEND_RULE_METRICS = ["spend", "budget_percent", "forecast", "spike", "balance"] as const;
export const SPEND_RULE_SCOPES = ["workspace", "key", "member", "department", "model", "provider"] as const;
export const SPEND_RULE_PERIODS = ["day", "week", "month", "rolling"] as const;
export const SPEND_RULE_BASE_KINDS = ["amount", "workspace_budget", "key_limit", "previous_period"] as const;
export const SPEND_RULE_BASE_REFS = ["daily", "weekly", "monthly"] as const;
export const SPEND_RULE_ACTIONS = ["notify", "block"] as const;
/** Nothing enforces blocks yet, so a rule that would block is refused rather than saved to only notify. */
export const SPEND_RULE_BLOCKS_AVAILABLE = false;

/**
 * What the evaluator handles so far (private.spend_rule_evaluable). Every metric the table
 * allows is accepted and saved; rules outside these lists are returned with evaluated: false
 * and fire nothing until a later release widens both this and the SQL function.
 */
export const EVALUATED_METRICS = ["spend", "budget_percent"] as const;
export const EVALUATED_PERIODS = ["day", "week", "month"] as const;
export const EVALUATED_BASE_KINDS = ["amount", "workspace_budget", "key_limit"] as const;

export type SpendRuleMetric = (typeof SPEND_RULE_METRICS)[number];
export type SpendRuleScope = (typeof SPEND_RULE_SCOPES)[number];
export type SpendRulePeriod = (typeof SPEND_RULE_PERIODS)[number];
export type SpendRuleBaseKind = (typeof SPEND_RULE_BASE_KINDS)[number];
export type SpendRuleBaseRef = (typeof SPEND_RULE_BASE_REFS)[number];
export type SpendRuleAction = (typeof SPEND_RULE_ACTIONS)[number];

export const SPEND_RULE_COLUMNS = "id,workspace_id,name,enabled,metric,scope_type,scope_id,period,window_hours,time_zone,base_kind,base_ref,base_amount_nanos,threshold_percents,threshold_amount_nanos,runway_days,spike_multiplier,spike_floor_nanos,action,block_at_percent,block_at_amount_nanos,block_free_models,cooldown_minutes,created_by,created_at,updated_at";

type Nanos = number | string | null;

/** The editable columns of a rule, as the database stores them. */
export type SpendRuleFields = {
	name: string;
	enabled: boolean;
	metric: SpendRuleMetric;
	scope_type: SpendRuleScope;
	scope_id: string | null;
	period: SpendRulePeriod;
	window_hours: number | null;
	time_zone: string | null;
	base_kind: SpendRuleBaseKind | null;
	base_ref: SpendRuleBaseRef | null;
	base_amount_nanos: number | null;
	threshold_percents: number[] | null;
	threshold_amount_nanos: number | null;
	runway_days: number | null;
	spike_multiplier: number | null;
	spike_floor_nanos: number | null;
	action: SpendRuleAction;
	block_at_percent: number;
	block_at_amount_nanos: number | null;
	block_free_models: boolean;
	cooldown_minutes: number;
};

/** A row of public.workspace_spend_rules (bigints may arrive as strings). */
export type SpendRuleRow = Omit<SpendRuleFields, "base_amount_nanos" | "threshold_amount_nanos" | "spike_floor_nanos" | "block_at_amount_nanos" | "spike_multiplier"> & {
	id: string;
	workspace_id: string;
	base_amount_nanos: Nanos;
	threshold_amount_nanos: Nanos;
	spike_multiplier: number | string | null;
	spike_floor_nanos: Nanos;
	block_at_amount_nanos: Nanos;
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

/** A rule as the APIs return it: nanos for exact amounts and *_usd alongside for reading. */
export type SpendRule = {
	id: string;
	workspace_id: string;
	name: string;
	enabled: boolean;
	metric: SpendRuleMetric;
	evaluated: boolean;
	scope_type: SpendRuleScope;
	scope_id: string | null;
	period: SpendRulePeriod;
	window_hours: number | null;
	time_zone: string | null;
	base_kind: SpendRuleBaseKind | null;
	base_ref: SpendRuleBaseRef | null;
	base_amount_nanos: number | null;
	base_amount_usd: number | null;
	threshold_percents: number[] | null;
	threshold_amount_nanos: number | null;
	threshold_amount_usd: number | null;
	runway_days: number | null;
	spike_multiplier: number | null;
	spike_floor_nanos: number | null;
	spike_floor_usd: number | null;
	action: SpendRuleAction;
	block_at_percent: number;
	block_at_amount_nanos: number | null;
	block_at_amount_usd: number | null;
	block_free_models: boolean;
	cooldown_minutes: number;
	destination_ids: string[];
	created_by: string | null;
	created_at: string;
	updated_at: string;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONEY_FIELDS = ["base_amount", "threshold_amount", "spike_floor", "block_at_amount"] as const;
type MoneyField = (typeof MONEY_FIELDS)[number];
const INPUT_FIELDS = new Set([
	"name", "enabled", "metric", "scope_type", "scope_id", "period", "window_hours", "time_zone",
	"base_kind", "base_ref", "threshold_percents", "runway_days", "spike_multiplier", "action",
	"block_at_percent", "block_free_models", "cooldown_minutes", "destination_ids",
	...MONEY_FIELDS.flatMap((field) => [`${field}_usd`, `${field}_nanos`]),
]);
const BASE_REF_FOR_PERIOD: Record<string, SpendRuleBaseRef | undefined> = { day: "daily", week: "weekly", month: "monthly" };

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);
const list = (values: readonly string[]) => values.join(", ");

export function isSpendRuleUuid(value: unknown): value is string {
	return typeof value === "string" && UUID_PATTERN.test(value);
}

export function spendNanosToUsd(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const nanos = Number(value);
	return Number.isFinite(nanos) ? nanos / 1_000_000_000 : null;
}

function nanosOrNull(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const nanos = Number(value);
	return Number.isFinite(nanos) ? nanos : null;
}

/** True for rules the evaluator fires on today (private.spend_rule_evaluable). */
export function isSpendRuleEvaluated(rule: { metric: string; period: string; base_kind: string | null }): boolean {
	return oneOf(EVALUATED_METRICS, rule.metric)
		&& oneOf(EVALUATED_PERIODS, rule.period)
		&& (rule.base_kind === null || oneOf(EVALUATED_BASE_KINDS, rule.base_kind));
}

function wholeNumber(value: unknown, field: string, min: number, max: number, nullable: boolean): Parsed<number | null> {
	if (value === null && nullable) return { ok: true, value: null };
	if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
		return { ok: false, message: `${field} must be a whole number from ${min} to ${max}${nullable ? ", or null" : ""}` };
	}
	return { ok: true, value };
}

/**
 * A money field given as `<field>_usd` (dollars) or `<field>_nanos` (exact, a whole number or a
 * numeric string), never both. undefined when neither is present.
 */
function money(body: Record<string, unknown>, field: MoneyField, allowZero: boolean): Parsed<number | null | undefined> {
	const usd = body[`${field}_usd`];
	const nanos = body[`${field}_nanos`];
	if (usd !== undefined && nanos !== undefined) return { ok: false, message: `Provide ${field}_usd or ${field}_nanos, not both` };
	const bound = allowZero ? "zero or more" : "more than zero";
	if (usd !== undefined) {
		if (usd === null) return { ok: true, value: null };
		const amount = typeof usd === "number" ? usd : NaN;
		const value = Math.round(amount * 1_000_000_000);
		if (!Number.isFinite(amount) || !Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
			return { ok: false, message: `${field}_usd must be a USD amount ${bound}, or null` };
		}
		return { ok: true, value };
	}
	if (nanos !== undefined) {
		if (nanos === null) return { ok: true, value: null };
		const value = typeof nanos === "number" ? nanos : typeof nanos === "string" && /^\d+$/.test(nanos.trim()) ? Number(nanos.trim()) : NaN;
		if (!Number.isSafeInteger(value) || value < 0 || (!allowZero && value === 0)) {
			return { ok: false, message: `${field}_nanos must be a whole number of nanodollars ${bound}, or null` };
		}
		return { ok: true, value };
	}
	return { ok: true, value: undefined };
}

function defaultFields(): Omit<SpendRuleFields, "name" | "metric" | "period"> {
	return {
		enabled: true,
		scope_type: "workspace",
		scope_id: null,
		window_hours: null,
		time_zone: null,
		base_kind: null,
		base_ref: null,
		base_amount_nanos: null,
		threshold_percents: null,
		threshold_amount_nanos: null,
		runway_days: null,
		spike_multiplier: null,
		spike_floor_nanos: null,
		action: "notify",
		block_at_percent: DEFAULT_BLOCK_AT_PERCENT,
		block_at_amount_nanos: null,
		block_free_models: false,
		cooldown_minutes: DEFAULT_COOLDOWN_MINUTES,
	};
}

/** The editable fields of a stored rule, with bigints as numbers. */
export function spendRuleFieldsFromRow(row: SpendRuleRow): SpendRuleFields {
	return {
		name: row.name,
		enabled: row.enabled !== false,
		metric: row.metric,
		scope_type: row.scope_type,
		scope_id: row.scope_id ?? null,
		period: row.period,
		window_hours: row.window_hours ?? null,
		time_zone: row.time_zone ?? null,
		base_kind: row.base_kind ?? null,
		base_ref: row.base_ref ?? null,
		base_amount_nanos: nanosOrNull(row.base_amount_nanos),
		threshold_percents: row.threshold_percents?.length ? [...row.threshold_percents] : null,
		threshold_amount_nanos: nanosOrNull(row.threshold_amount_nanos),
		runway_days: row.runway_days ?? null,
		spike_multiplier: row.spike_multiplier === null || row.spike_multiplier === undefined ? null : Number(row.spike_multiplier),
		spike_floor_nanos: nanosOrNull(row.spike_floor_nanos),
		action: row.action,
		block_at_percent: Number(row.block_at_percent ?? DEFAULT_BLOCK_AT_PERCENT),
		block_at_amount_nanos: nanosOrNull(row.block_at_amount_nanos),
		block_free_models: row.block_free_models === true,
		cooldown_minutes: Number(row.cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES),
	};
}

export type SpendRuleInputOptions = {
	/** The stored rule for an update; omitted for a create. */
	existing?: SpendRuleFields | null;
	/** IANA zone validation (each app's parseIanaTimeZone). */
	parseTimeZone: (value: unknown) => string | null;
};

export type SpendRuleInput = {
	/** Every editable column, ready for public.save_workspace_spend_rule. */
	fields: SpendRuleFields;
	/** The new destination list, or null to keep the rule's destinations. */
	destinationIds: string[] | null;
};

/**
 * Validates a create (no existing rule) or a partial update (fields merged over the stored
 * rule), then checks the whole rule as the table's CHECK constraints do. Defaults on create:
 * enabled, workspace scope, notify, block at 110%, cooldown 360 minutes; spike rules default to
 * a 3x multiplier and a $5 floor. Fields a rule no longer uses after an update (block_at_amount
 * once it stops being a spend block rule, the spike settings once it stops being a spike rule)
 * are cleared unless the request sets them.
 */
export function parseSpendRuleInput(body: Record<string, unknown>, options: SpendRuleInputOptions): Parsed<SpendRuleInput> {
	for (const key of Object.keys(body)) {
		if (!INPUT_FIELDS.has(key)) return { ok: false, message: `Unknown field: ${key}` };
	}
	const existing = options.existing ?? null;
	if (existing && Object.keys(body).length === 0) return { ok: false, message: "Provide at least one field to update" };
	if (!existing) {
		for (const field of ["name", "metric", "period"]) {
			if (body[field] === undefined) return { ok: false, message: `${field} is required` };
		}
	}
	const rule = { ...defaultFields(), ...(existing ?? {}) } as SpendRuleFields;
	const has = (field: string) => body[field] !== undefined;

	if (has("name")) {
		const name = typeof body.name === "string" ? body.name.trim() : "";
		if (name.length < 1 || name.length > 100) return { ok: false, message: "name must be 1 to 100 characters" };
		rule.name = name;
	}
	if (has("enabled")) {
		if (typeof body.enabled !== "boolean") return { ok: false, message: "enabled must be a boolean" };
		rule.enabled = body.enabled;
	}
	if (has("metric")) {
		if (!oneOf(SPEND_RULE_METRICS, body.metric)) return { ok: false, message: `metric must be one of: ${list(SPEND_RULE_METRICS)}` };
		rule.metric = body.metric;
	}
	if (has("scope_type")) {
		if (!oneOf(SPEND_RULE_SCOPES, body.scope_type)) return { ok: false, message: `scope_type must be one of: ${list(SPEND_RULE_SCOPES)}` };
		rule.scope_type = body.scope_type;
		if (body.scope_type === "workspace" && !has("scope_id")) rule.scope_id = null;
	}
	if (has("scope_id")) {
		if (body.scope_id === null) rule.scope_id = null;
		else if (typeof body.scope_id !== "string" || !body.scope_id.trim() || body.scope_id.trim().length > 200) {
			return { ok: false, message: "scope_id must be a string of 1 to 200 characters, or null" };
		} else rule.scope_id = body.scope_id.trim();
	}
	if (has("period")) {
		if (!oneOf(SPEND_RULE_PERIODS, body.period)) return { ok: false, message: `period must be one of: ${list(SPEND_RULE_PERIODS)}` };
		rule.period = body.period;
	}
	if (has("window_hours")) {
		const hours = wholeNumber(body.window_hours, "window_hours", 1, 720, true);
		if (hours.ok === false) return hours;
		rule.window_hours = hours.value;
	}
	if (has("time_zone")) {
		if (body.time_zone === null || (typeof body.time_zone === "string" && !body.time_zone.trim())) rule.time_zone = null;
		else {
			const zone = options.parseTimeZone(body.time_zone);
			if (!zone) return { ok: false, message: "time_zone must be an IANA time zone such as Europe/London, or null to use the workspace's billing time zone" };
			rule.time_zone = zone;
		}
	}
	if (has("base_kind")) {
		if (body.base_kind !== null && !oneOf(SPEND_RULE_BASE_KINDS, body.base_kind)) return { ok: false, message: `base_kind must be one of: ${list(SPEND_RULE_BASE_KINDS)}, or null` };
		rule.base_kind = body.base_kind as SpendRuleBaseKind | null;
	}
	if (has("base_ref")) {
		if (body.base_ref !== null && !oneOf(SPEND_RULE_BASE_REFS, body.base_ref)) return { ok: false, message: `base_ref must be one of: ${list(SPEND_RULE_BASE_REFS)}, or null` };
		rule.base_ref = body.base_ref as SpendRuleBaseRef | null;
	}
	if (has("threshold_percents")) {
		if (body.threshold_percents === null) rule.threshold_percents = null;
		else {
			const values = body.threshold_percents;
			if (!Array.isArray(values) || values.length < 1 || values.length > MAX_SPEND_RULE_THRESHOLDS
				|| values.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1000)) {
				return { ok: false, message: `threshold_percents must be 1 to ${MAX_SPEND_RULE_THRESHOLDS} whole percentages from 1 to 1000, or null` };
			}
			rule.threshold_percents = [...new Set(values as number[])].sort((a, b) => a - b);
		}
	}
	if (has("runway_days")) {
		const days = wholeNumber(body.runway_days, "runway_days", 1, 365, true);
		if (days.ok === false) return days;
		rule.runway_days = days.value;
	}
	if (has("spike_multiplier")) {
		const value = body.spike_multiplier;
		if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value <= 1 || value > 100 || Math.round(value * 100) !== value * 100)) {
			return { ok: false, message: "spike_multiplier must be more than 1 and at most 100, with at most two decimal places, or null" };
		}
		rule.spike_multiplier = value as number | null;
	}
	if (has("action")) {
		if (!oneOf(SPEND_RULE_ACTIONS, body.action)) return { ok: false, message: `action must be one of: ${list(SPEND_RULE_ACTIONS)}` };
		rule.action = body.action;
	}
	if (has("block_at_percent")) {
		const percent = wholeNumber(body.block_at_percent, "block_at_percent", 100, 1000, false);
		if (percent.ok === false) return percent;
		rule.block_at_percent = percent.value as number;
	}
	if (has("block_free_models")) {
		if (typeof body.block_free_models !== "boolean") return { ok: false, message: "block_free_models must be a boolean" };
		rule.block_free_models = body.block_free_models;
	}
	if (has("cooldown_minutes")) {
		const minutes = wholeNumber(body.cooldown_minutes, "cooldown_minutes", 5, 43_200, false);
		if (minutes.ok === false) return minutes;
		rule.cooldown_minutes = minutes.value as number;
	}
	const moneyTouched = new Set<MoneyField>();
	for (const field of MONEY_FIELDS) {
		const parsed = money(body, field, field === "spike_floor");
		if (parsed.ok === false) return parsed;
		if (parsed.value === undefined) continue;
		moneyTouched.add(field);
		rule[`${field}_nanos`] = parsed.value;
	}

	let destinationIds: string[] | null = null;
	if (has("destination_ids")) {
		const ids = body.destination_ids;
		if (!Array.isArray(ids) || ids.length > MAX_SPEND_RULE_DESTINATIONS || ids.some((value) => !isSpendRuleUuid(value))) {
			return { ok: false, message: `destination_ids must be an array of at most ${MAX_SPEND_RULE_DESTINATIONS} notification destination ids` };
		}
		destinationIds = [...new Set((ids as string[]).map((value) => value.toLowerCase()))].sort();
	} else if (!existing) destinationIds = [];

	// Defaults and fields that only some rules use.
	if (rule.metric === "spike") {
		if (rule.spike_multiplier === null && !has("spike_multiplier")) rule.spike_multiplier = DEFAULT_SPIKE_MULTIPLIER;
		if (rule.spike_floor_nanos === null && !moneyTouched.has("spike_floor")) rule.spike_floor_nanos = DEFAULT_SPIKE_FLOOR_NANOS;
	} else {
		if (!has("spike_multiplier")) rule.spike_multiplier = null;
		if (!moneyTouched.has("spike_floor")) rule.spike_floor_nanos = null;
	}
	if (!(rule.action === "block" && rule.metric === "spend") && !moneyTouched.has("block_at_amount")) rule.block_at_amount_nanos = null;
	if (rule.scope_type === "workspace" && existing && has("scope_type") && !has("scope_id")) rule.scope_id = null;

	const problem = spendRuleProblem(rule);
	if (problem) return { ok: false, message: problem };
	if (rule.scope_id && ["key", "member", "department"].includes(rule.scope_type)) rule.scope_id = rule.scope_id.toLowerCase();
	return { ok: true, value: { fields: rule, destinationIds } };
}

/** The first way a complete rule breaks the table's CHECK constraints, or null if it is valid. */
export function spendRuleProblem(rule: SpendRuleFields): string | null {
	const notUsed = (field: string, what: string) => `${field} is not used by ${what}; set it to null`;
	const metric = rule.metric;
	const rules = `${metric} rules`;

	// workspace_spend_rules_scope_check and the scope foreign keys.
	if (rule.scope_type === "workspace") {
		if (rule.scope_id !== null) return "scope_id must be null for the workspace scope";
	} else {
		if (rule.scope_id === null) return `scope_id is required for the ${rule.scope_type} scope`;
		if (["key", "member", "department"].includes(rule.scope_type) && !isSpendRuleUuid(rule.scope_id)) {
			return `scope_id must be the ${rule.scope_type === "member" ? "member's user" : rule.scope_type} id (a uuid)`;
		}
	}
	// workspace_spend_rules_window_hours_check
	if (rule.period === "rolling" && rule.window_hours === null) return "window_hours (1 to 720) is required for rolling rules";
	if (rule.period !== "rolling" && rule.window_hours !== null) return "window_hours is only used by rolling rules; set it to null";
	// workspace_spend_rules_base_check
	if (rule.base_kind === null) {
		if (rule.base_ref !== null) return "base_ref needs a base_kind of workspace_budget or key_limit";
		if (rule.base_amount_nanos !== null) return "base_amount needs a base_kind of amount";
	} else if (rule.base_kind === "amount") {
		if (rule.base_amount_nanos === null) return "base_amount_usd (or base_amount_nanos) is required when base_kind is amount";
		if (rule.base_ref !== null) return notUsed("base_ref", "an amount base");
	} else if (rule.base_kind === "workspace_budget" || rule.base_kind === "key_limit") {
		const expected = BASE_REF_FOR_PERIOD[rule.period];
		if (!expected) return `A ${rule.base_kind} base needs a day, week or month period`;
		if (rule.base_ref !== expected) return `base_ref must be ${expected} for a ${rule.period} period`;
		if (rule.base_amount_nanos !== null) return notUsed("base_amount", `a ${rule.base_kind} base`);
		if (rule.base_kind === "key_limit" && rule.scope_type !== "key") return "A key_limit base needs the key scope";
	} else {
		if (rule.base_ref !== null) return notUsed("base_ref", "a previous_period base");
		if (rule.base_amount_nanos !== null) return notUsed("base_amount", "a previous_period base");
	}
	// The per-metric field checks.
	if (metric === "spend") {
		if (rule.threshold_amount_nanos === null) return "threshold_amount_usd (or threshold_amount_nanos) is required for spend rules";
		if (rule.base_kind !== null) return notUsed("base_kind", rules);
		if (rule.threshold_percents !== null) return notUsed("threshold_percents", rules);
	} else if (metric === "budget_percent") {
		if (rule.base_kind === null) return "base_kind is required for budget_percent rules";
		if (rule.threshold_percents === null) return "threshold_percents is required for budget_percent rules";
		if (rule.threshold_amount_nanos !== null) return notUsed("threshold_amount", rules);
	} else if (metric === "forecast") {
		if (rule.period === "rolling") return "forecast rules need a day, week or month period";
		const byAmount = rule.threshold_amount_nanos !== null;
		const byPercent = rule.base_kind !== null || rule.threshold_percents !== null;
		if (byAmount === byPercent) return "forecast rules need either threshold_amount, or base_kind with threshold_percents";
		if (byPercent && (rule.base_kind === null || rule.threshold_percents === null)) return "forecast rules by percentage need both base_kind and threshold_percents";
	} else if (metric === "spike") {
		if (rule.period !== "rolling") return "spike rules need the rolling period (window_hours is the spike window)";
		if (rule.base_kind !== null) return notUsed("base_kind", rules);
		if (rule.threshold_percents !== null) return notUsed("threshold_percents", rules);
		if (rule.threshold_amount_nanos !== null) return notUsed("threshold_amount", rules);
	} else {
		if (rule.scope_type !== "workspace") return "balance rules need the workspace scope";
		if (rule.period !== "rolling") return "balance rules need the rolling period (window_hours is the burn-rate lookback)";
		if (rule.threshold_amount_nanos === null && rule.runway_days === null) return "balance rules need threshold_amount, runway_days, or both";
		if (rule.base_kind !== null) return notUsed("base_kind", rules);
		if (rule.threshold_percents !== null) return notUsed("threshold_percents", rules);
	}
	if (metric !== "balance" && rule.runway_days !== null) return notUsed("runway_days", rules);
	if (metric === "spike") {
		if (rule.spike_multiplier === null) return "spike_multiplier is required for spike rules";
		if (rule.spike_floor_nanos === null) return "spike_floor is required for spike rules";
	} else {
		if (rule.spike_multiplier !== null) return notUsed("spike_multiplier", rules);
		if (rule.spike_floor_nanos !== null) return notUsed("spike_floor", rules);
	}
	// workspace_spend_rules_block_metric_check, _block_at_amount_check, _block_at_percent_check
	if (rule.action === "block") {
		if (metric !== "spend" && metric !== "budget_percent") return "Only spend and budget_percent rules can block";
		if (metric === "budget_percent" && rule.base_kind === "previous_period") return "Rules with a previous_period base cannot block";
		if (metric === "spend") {
			if (rule.block_at_amount_nanos === null) return "block_at_amount_usd (or block_at_amount_nanos) is required for spend rules that block";
			if (rule.threshold_amount_nanos !== null && rule.block_at_amount_nanos < rule.threshold_amount_nanos) return "block_at_amount must be at least threshold_amount";
		}
		if (metric === "budget_percent" && rule.threshold_percents && rule.block_at_percent < Math.max(...rule.threshold_percents)) {
			return "block_at_percent must be at least the highest of threshold_percents";
		}
		if (!SPEND_RULE_BLOCKS_AVAILABLE) return "action block is not available yet; use notify";
	} else if (rule.block_at_amount_nanos !== null) {
		return "block_at_amount is only used by spend rules that block; set it to null";
	}
	return null;
}

export function formatSpendRule(row: SpendRuleRow, destinationIds: readonly string[] = []): SpendRule {
	const fields = spendRuleFieldsFromRow(row);
	return {
		id: row.id,
		workspace_id: row.workspace_id,
		name: fields.name,
		enabled: fields.enabled,
		metric: fields.metric,
		evaluated: isSpendRuleEvaluated(fields),
		scope_type: fields.scope_type,
		scope_id: fields.scope_id,
		period: fields.period,
		window_hours: fields.window_hours,
		time_zone: fields.time_zone,
		base_kind: fields.base_kind,
		base_ref: fields.base_ref,
		base_amount_nanos: fields.base_amount_nanos,
		base_amount_usd: spendNanosToUsd(fields.base_amount_nanos),
		threshold_percents: fields.threshold_percents,
		threshold_amount_nanos: fields.threshold_amount_nanos,
		threshold_amount_usd: spendNanosToUsd(fields.threshold_amount_nanos),
		runway_days: fields.runway_days,
		spike_multiplier: fields.spike_multiplier,
		spike_floor_nanos: fields.spike_floor_nanos,
		spike_floor_usd: spendNanosToUsd(fields.spike_floor_nanos),
		action: fields.action,
		block_at_percent: fields.block_at_percent,
		block_at_amount_nanos: fields.block_at_amount_nanos,
		block_at_amount_usd: spendNanosToUsd(fields.block_at_amount_nanos),
		block_free_models: fields.block_free_models,
		cooldown_minutes: fields.cooldown_minutes,
		destination_ids: [...destinationIds].map(String).sort(),
		created_by: row.created_by ?? null,
		created_at: row.created_at,
		updated_at: row.updated_at,
	};
}

/** The destination ids PostgREST embeds as workspace_spend_rule_destinations(destination_id). */
export function embeddedDestinationIds(row: { workspace_spend_rule_destinations?: unknown }): string[] {
	const links = Array.isArray(row.workspace_spend_rule_destinations) ? row.workspace_spend_rule_destinations : [];
	return links.map((link) => String((link as { destination_id?: unknown }).destination_id ?? "")).filter(Boolean);
}

export type SpendRuleWriteError = { status: 400 | 404 | 409; error: string; message: string };

const CONSTRAINT_MESSAGES: Record<string, string> = {
	workspace_spend_rules_key_fkey: "scope_id must be an API key in this workspace",
	workspace_spend_rules_member_fkey: "scope_id must be a member of this workspace",
	workspace_spend_rules_department_fkey: "scope_id must be a department in this workspace",
	workspace_spend_rule_destinations_destination_fkey: "destination_ids must be notification destinations in this workspace",
};

/**
 * Maps errors from public.save_workspace_spend_rule, the table's trigger and its constraints to a
 * status and message; null for anything unexpected (the caller answers 5xx).
 */
export function spendRuleWriteError(error: { code?: string | null; message?: string | null } | null | undefined): SpendRuleWriteError | null {
	if (!error) return null;
	const message = String(error.message ?? "");
	const bad = (text: string): SpendRuleWriteError => ({ status: 400, error: "bad_request", message: text });
	if (message.includes("spend_rule_limit_reached")) {
		return { status: 409, error: "spend_rule_limit_reached", message: `A workspace can have at most ${MAX_SPEND_RULES_PER_WORKSPACE} spend rules` };
	}
	if (message.includes("spend_rule_not_found")) return { status: 404, error: "not_found", message: "Spend rule not found" };
	if (message.includes("invalid_time_zone")) return bad("time_zone must be an IANA time zone such as Europe/London, or null to use the workspace's billing time zone");
	if (message.includes("invalid_spend_rule_scope_id")) return bad("scope_id must be a uuid for the key, member and department scopes");
	if (message.includes("spend_rule_workspace_immutable")) return bad("A spend rule cannot move to another workspace");
	if (message.includes("notification_destination_not_found")) return bad("destination_ids must be notification destinations in this workspace");
	if (message.includes("too_many_spend_rule_destinations")) return bad(`destination_ids can list at most ${MAX_SPEND_RULE_DESTINATIONS} destinations`);
	for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) if (message.includes(constraint)) return bad(text);
	const check = message.match(/workspace_spend_rules_[a-z_]+_check/)?.[0];
	if (check || error.code === "23514") return bad(`The spend rule is not valid${check ? ` (${check})` : ""}`);
	if (error.code === "22P02" || error.code === "22023") return bad("The spend rule is not valid");
	return null;
}

/** Offset pagination for rule history: limit 1-100 (default 50), offset 0-100000. */
export function parseSpendRuleHistoryPage(limitValue: string | null | undefined, offsetValue: string | null | undefined): Parsed<{ limit: number; offset: number }> {
	const limit = limitValue === null || limitValue === undefined || limitValue === "" ? DEFAULT_SPEND_RULE_HISTORY_PAGE : Number(limitValue);
	const offset = offsetValue === null || offsetValue === undefined || offsetValue === "" ? 0 : Number(offsetValue);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SPEND_RULE_HISTORY_PAGE) {
		return { ok: false, message: `limit must be a whole number from 1 to ${MAX_SPEND_RULE_HISTORY_PAGE}` };
	}
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) return { ok: false, message: "offset must be a whole number from 0 to 100000" };
	return { ok: true, value: { limit, offset } };
}

type Json = Record<string, unknown>;

export type SpendRulePreview = {
	rule_id: string;
	metric: SpendRuleMetric;
	evaluated: boolean;
	computed_at: string;
	time_zone: string;
	period: { kind: SpendRulePeriod; start: string; end: string } | null;
	value_nanos: number | null;
	value_usd: number | null;
	base_kind: SpendRuleBaseKind | null;
	base_ref: SpendRuleBaseRef | null;
	base_nanos: number | null;
	base_usd: number | null;
	percent: number | null;
	threshold_percents: number[] | null;
	threshold_amount_nanos: number | null;
	threshold_amount_usd: number | null;
	reached_threshold_percent: number | null;
	next_threshold: { percent: number | null; amount_nanos: number; amount_usd: number } | null;
	block_at_nanos: number | null;
	block_at_usd: number | null;
	state: { highest_percent_fired: number | null; amount_fired_at: string | null; last_fired_at: string | null; fire_count: number } | null;
	alert: { scope_label: string; title: string; message: string } | null;
};

/** public.preview_workspace_spend_rule's result with *_usd alongside each amount. */
export function formatSpendRulePreview(raw: Json): SpendRulePreview {
	const next = raw.next_threshold as Json | null | undefined;
	const nextNanos = nanosOrNull(next?.amount_nanos);
	const state = raw.state as Json | null | undefined;
	const alert = raw.alert as Json | null | undefined;
	const period = raw.period as Json | null | undefined;
	return {
		rule_id: String(raw.rule_id ?? ""),
		metric: raw.metric as SpendRuleMetric,
		evaluated: raw.evaluated === true,
		computed_at: String(raw.computed_at ?? ""),
		time_zone: String(raw.time_zone ?? "UTC"),
		period: period ? { kind: period.kind as SpendRulePeriod, start: String(period.start), end: String(period.end) } : null,
		value_nanos: nanosOrNull(raw.value_nanos),
		value_usd: spendNanosToUsd(raw.value_nanos),
		base_kind: (raw.base_kind ?? null) as SpendRuleBaseKind | null,
		base_ref: (raw.base_ref ?? null) as SpendRuleBaseRef | null,
		base_nanos: nanosOrNull(raw.base_nanos),
		base_usd: spendNanosToUsd(raw.base_nanos),
		percent: raw.percent === null || raw.percent === undefined ? null : Number(raw.percent),
		threshold_percents: Array.isArray(raw.threshold_percents) ? (raw.threshold_percents as unknown[]).map(Number) : null,
		threshold_amount_nanos: nanosOrNull(raw.threshold_amount_nanos),
		threshold_amount_usd: spendNanosToUsd(raw.threshold_amount_nanos),
		reached_threshold_percent: raw.reached_threshold_percent === null || raw.reached_threshold_percent === undefined ? null : Number(raw.reached_threshold_percent),
		next_threshold: next && nextNanos !== null
			? { percent: next.percent === null || next.percent === undefined ? null : Number(next.percent), amount_nanos: nextNanos, amount_usd: nextNanos / 1_000_000_000 }
			: null,
		block_at_nanos: nanosOrNull(raw.block_at_nanos),
		block_at_usd: spendNanosToUsd(raw.block_at_nanos),
		state: state ? {
			highest_percent_fired: state.highest_percent_fired === null || state.highest_percent_fired === undefined ? null : Number(state.highest_percent_fired),
			amount_fired_at: (state.amount_fired_at ?? null) as string | null,
			last_fired_at: (state.last_fired_at ?? null) as string | null,
			fire_count: Number(state.fire_count ?? 0),
		} : null,
		alert: alert ? { scope_label: String(alert.scope_label ?? ""), title: String(alert.title ?? ""), message: String(alert.message ?? "") } : null,
	};
}

export type SpendRuleHistoryEvent = {
	id: string;
	kind: "spend_alert" | "spend_blocked";
	created_at: string;
	title: string | null;
	message: string | null;
	state: string | null;
	threshold_percent: number | null;
	thresholds_crossed: number[] | null;
	threshold_amount_nanos: number | null;
	threshold_amount_usd: number | null;
	value_nanos: number | null;
	value_usd: number | null;
	base_nanos: number | null;
	base_usd: number | null;
	percent: number | null;
	period: { kind: string; start: string; end: string | null; time_zone?: string } | null;
	deliveries: { sent: number; failed: number; pending: number };
};

export type SpendRuleHistoryPeriod = {
	period_start: string | null;
	period_end: string | null;
	highest_percent_fired: number | null;
	amount_fired_at: string | null;
	last_fired_at: string | null;
	fire_count: number;
	last_value_nanos: number | null;
	last_value_usd: number | null;
	last_base_nanos: number | null;
	last_base_usd: number | null;
};

export type SpendRuleHistory = { events: SpendRuleHistoryEvent[]; has_more: boolean; periods: SpendRuleHistoryPeriod[] };

const numberOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** public.list_workspace_spend_rule_history's result with *_usd alongside each amount. */
export function formatSpendRuleHistory(raw: Json): SpendRuleHistory {
	const events = Array.isArray(raw.events) ? raw.events as Json[] : [];
	const periods = Array.isArray(raw.periods) ? raw.periods as Json[] : [];
	return {
		events: events.map((event) => {
			const deliveries = (event.deliveries ?? {}) as Json;
			return {
				id: String(event.id),
				kind: event.kind as SpendRuleHistoryEvent["kind"],
				created_at: String(event.created_at),
				title: (event.title ?? null) as string | null,
				message: (event.message ?? null) as string | null,
				state: (event.state ?? null) as string | null,
				threshold_percent: numberOrNull(event.threshold_percent),
				thresholds_crossed: Array.isArray(event.thresholds_crossed) ? (event.thresholds_crossed as unknown[]).map(Number) : null,
				threshold_amount_nanos: nanosOrNull(event.threshold_amount_nanos),
				threshold_amount_usd: spendNanosToUsd(event.threshold_amount_nanos),
				value_nanos: nanosOrNull(event.value_nanos),
				value_usd: spendNanosToUsd(event.value_nanos),
				base_nanos: nanosOrNull(event.base_nanos),
				base_usd: spendNanosToUsd(event.base_nanos),
				percent: numberOrNull(event.percent),
				period: (event.period ?? null) as SpendRuleHistoryEvent["period"],
				deliveries: { sent: Number(deliveries.sent ?? 0), failed: Number(deliveries.failed ?? 0), pending: Number(deliveries.pending ?? 0) },
			};
		}),
		has_more: raw.has_more === true,
		periods: periods.map((period) => ({
			period_start: (period.period_start ?? null) as string | null,
			period_end: (period.period_end ?? null) as string | null,
			highest_percent_fired: numberOrNull(period.highest_percent_fired),
			amount_fired_at: (period.amount_fired_at ?? null) as string | null,
			last_fired_at: (period.last_fired_at ?? null) as string | null,
			fire_count: Number(period.fire_count ?? 0),
			last_value_nanos: nanosOrNull(period.last_value_nanos),
			last_value_usd: spendNanosToUsd(period.last_value_nanos),
			last_base_nanos: nanosOrNull(period.last_base_nanos),
			last_base_usd: spendNanosToUsd(period.last_base_nanos),
		})),
	};
}

export type SpendRuleTestDelivery = {
	destination_id: string;
	name: string;
	type: string;
	delivered: boolean;
	status: number | null;
	error: string | null;
};

export type SpendRuleTestResult = {
	rule_id: string;
	rule_name: string;
	test: true;
	title: string;
	message: string;
	/** rule: the rule's own destinations; routes: the workspace's spend_alert routes. */
	source: "rule" | "routes";
	delivered: number;
	failed: number;
	deliveries: SpendRuleTestDelivery[];
};

// ---- Spend blocks (grace-margin blocking): public.list_workspace_spend_blocks and
// public.lift_workspace_spend_block, shared by the control API (/v1/control/spend-blocks) and
// web-api (Settings → Notifications).

export const SPEND_BLOCK_LIFT_REASONS = ["manual", "period_reset", "below_limit", "rule_changed", "rule_disabled", "rule_deleted"] as const;
export type SpendBlockLiftReason = (typeof SPEND_BLOCK_LIFT_REASONS)[number];
export const MAX_SPEND_BLOCK_PAGE = 100;
export const DEFAULT_SPEND_BLOCK_PAGE = 50;

export type SpendBlock = {
	id: string;
	workspace_id: string;
	/** Null once the rule has been deleted outright (its key, member or department was removed). */
	rule_id: string | null;
	rule_name: string | null;
	scope_type: SpendRuleScope;
	scope_id: string | null;
	scope_label: string;
	block_free_models: boolean;
	period_start: string;
	/** When the block lifts by itself: the end of the rule's period (the 429's Retry-After). */
	resets_at: string | null;
	spend_nanos: number;
	spend_usd: number;
	limit_nanos: number;
	limit_usd: number;
	started_at: string;
	lifted_at: string | null;
	lifted_by: string | null;
	lift_reason: SpendBlockLiftReason | null;
	/** Not lifted, and its reset has not passed. */
	active: boolean;
};

/** One row of public.list_workspace_spend_blocks with *_usd alongside each amount. */
export function formatSpendBlock(raw: Json): SpendBlock {
	const spend = nanosOrNull(raw.spend_nanos) ?? 0;
	const limit = nanosOrNull(raw.limit_nanos) ?? 0;
	return {
		id: String(raw.id ?? ""),
		workspace_id: String(raw.workspace_id ?? ""),
		rule_id: (raw.rule_id ?? null) as string | null,
		rule_name: (raw.rule_name ?? null) as string | null,
		scope_type: raw.scope_type as SpendRuleScope,
		scope_id: (raw.scope_id ?? null) as string | null,
		scope_label: String(raw.scope_label ?? raw.scope_id ?? ""),
		block_free_models: raw.block_free_models === true,
		period_start: String(raw.period_start ?? ""),
		resets_at: (raw.resets_at ?? null) as string | null,
		spend_nanos: spend,
		spend_usd: spend / 1_000_000_000,
		limit_nanos: limit,
		limit_usd: limit / 1_000_000_000,
		started_at: String(raw.started_at ?? ""),
		lifted_at: (raw.lifted_at ?? null) as string | null,
		lifted_by: (raw.lifted_by ?? null) as string | null,
		lift_reason: (raw.lift_reason ?? null) as SpendBlockLiftReason | null,
		active: raw.active === true,
	};
}

export function formatSpendBlocks(raw: unknown): SpendBlock[] {
	return Array.isArray(raw) ? (raw as Json[]).map(formatSpendBlock) : [];
}

/** ?include_lifted=true|false&limit=1..100 for the block list. */
export function parseSpendBlockListQuery(includeLiftedValue: string | null | undefined, limitValue: string | null | undefined): Parsed<{ includeLifted: boolean; limit: number }> {
	const includeLifted = includeLiftedValue == null || includeLiftedValue === "" ? false
		: includeLiftedValue === "true" ? true : includeLiftedValue === "false" ? false : null;
	if (includeLifted === null) return { ok: false, message: "include_lifted must be true or false" };
	const limit = limitValue == null || limitValue === "" ? DEFAULT_SPEND_BLOCK_PAGE : Number(limitValue);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SPEND_BLOCK_PAGE) return { ok: false, message: `limit must be a whole number from 1 to ${MAX_SPEND_BLOCK_PAGE}` };
	return { ok: true, value: { includeLifted, limit } };
}

/** Maps public.lift_workspace_spend_block's errors; null for anything else (a 5xx). */
export function spendBlockLiftError(error: { message?: string | null } | null | undefined): { status: 404 | 409; error: string; message: string } | null {
	const message = String(error?.message ?? "");
	if (message.includes("spend_block_not_found")) return { status: 404, error: "not_found", message: "Spend block not found" };
	if (message.includes("spend_block_not_active")) return { status: 409, error: "spend_block_not_active", message: "This block has already been lifted" };
	return null;
}
