// The spend rule editor's form state and the pure logic around it: defaults, prefill from a
// shortcut link, keeping the fields consistent when the alert type, period or base changes,
// field-level validation (as message keys, so the page can translate them) and shaping the
// request the settings API takes. The request is always a complete rule: every field the rule
// does not use is sent as null, so a PATCH never leaves stale fields from another alert type.
// The shared module's parseSpendRuleInput then checks it exactly as the API will.

import {
	DEFAULT_BLOCK_AT_PERCENT,
	DEFAULT_COOLDOWN_MINUTES,
	DEFAULT_SPIKE_FLOOR_NANOS,
	DEFAULT_SPIKE_MULTIPLIER,
	MAX_SPEND_RULE_THRESHOLDS,
	MAX_SPIKE_WINDOW_HOURS,
	SPIKE_MIN_BASELINE_WINDOWS,
	SPEND_RULE_BASE_KINDS,
	SPEND_RULE_METRICS,
	SPEND_RULE_PERIODS,
	SPEND_RULE_SCOPES,
	isSpendRuleEvaluated,
	parseSpendRuleInput,
	type SpendRule,
	type SpendRuleAction,
	type SpendRuleBaseKind,
	type SpendRuleBaseRef,
	type SpendRuleMetric,
	type SpendRulePeriod,
	type SpendRulePreview,
	type SpendRuleScope,
} from "./spendRules";

export const PRESET_THRESHOLDS = [50, 80, 100] as const;
export const KEY_LIMIT_ALERT_PERCENT = 80;
export const DEFAULT_ROLLING_HOURS = 24;
export const DEFAULT_SPIKE_WINDOW_HOURS = 6;
export const DEFAULT_BALANCE_LOOKBACK_HOURS = 168;
export const SPEND_ALERT_ANCHOR = "spend-alerts";

export type ForecastMode = "amount" | "percent";

/** Form state: numbers stay as typed strings until the request is shaped. */
export type SpendRuleDraft = {
	name: string;
	enabled: boolean;
	metric: SpendRuleMetric;
	scopeType: SpendRuleScope;
	/** Empty for the workspace scope. */
	scopeId: string;
	period: SpendRulePeriod;
	windowHours: string;
	/** Empty means the workspace's billing time zone. */
	timeZone: string;
	baseKind: SpendRuleBaseKind;
	/** The alert-only amount for an amount base. */
	baseAmountUsd: string;
	thresholdPercents: number[];
	/** spend: $ reached; forecast by amount: projected $; balance: balance at or below. */
	thresholdAmountUsd: string;
	forecastMode: ForecastMode;
	runwayDays: string;
	spikeMultiplier: string;
	spikeFloorUsd: string;
	cooldownMinutes: string;
	action: SpendRuleAction;
	blockAtPercent: string;
	blockAtAmountUsd: string;
	blockFreeModels: boolean;
	destinationIds: string[];
};

export type SpendRulePrefill = Partial<Pick<SpendRuleDraft, "name" | "metric" | "scopeType" | "scopeId" | "period" | "baseKind" | "thresholdPercents">>;

export type DraftField = keyof SpendRuleDraft;
export type DraftIssueCode =
	| "nameRequired"
	| "scopeRequired"
	| "windowHoursRange"
	| "spikeWindowRange"
	| "timeZoneInvalid"
	| "amountInvalid"
	| "thresholdsRequired"
	| "baseNeedsCalendar"
	| "keyLimitNeedsKey"
	| "balanceNeedsTarget"
	| "runwayRange"
	| "multiplierRange"
	| "floorInvalid"
	| "cooldownRange"
	| "blockPercentRange"
	| "blockPercentBelowThreshold"
	| "blockAmountBelowThreshold";
export type DraftIssue = { field: DraftField; code: DraftIssueCode };

export type SpendRulePayload = Record<string, unknown>;
export type DraftCheck =
	| { ok: true; payload: SpendRulePayload }
	| { ok: false; issues: DraftIssue[]; message: string | null };

const BASE_REF_FOR_PERIOD: Partial<Record<SpendRulePeriod, SpendRuleBaseRef>> = { day: "daily", week: "weekly", month: "monthly" };
const PERIOD_FOR_BASE_REF: Record<SpendRuleBaseRef, SpendRulePeriod> = { daily: "day", weekly: "week", monthly: "month" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const oneOf = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === "string" && (values as readonly string[]).includes(value);

export function baseRefForPeriod(period: SpendRulePeriod): SpendRuleBaseRef | null {
	return BASE_REF_FOR_PERIOD[period] ?? null;
}

export function periodForBaseRef(ref: SpendRuleBaseRef): SpendRulePeriod {
	return PERIOD_FOR_BASE_REF[ref];
}

/** A USD amount typed in the form: up to 4 decimal places, more than zero unless allowZero. */
export function parseUsd(value: string, allowZero = false): number | null {
	const text = value.trim();
	if (!/^(?:\d+(?:\.\d{0,4})?|\.\d{1,4})$/.test(text)) return null;
	const amount = Number(text);
	if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) return null;
	return Number.isSafeInteger(Math.round(amount * 1_000_000_000)) ? amount : null;
}

function wholeNumber(value: string, min: number, max: number): number | null {
	const text = value.trim();
	if (!/^\d+$/.test(text)) return null;
	const number = Number(text);
	return number >= min && number <= max ? number : null;
}

function multiplier(value: string): number | null {
	const text = value.trim();
	if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
	const number = Number(text);
	return number > 1 && number <= 100 ? number : null;
}

const usdText = (usd: number | null | undefined) => (usd === null || usd === undefined ? "" : String(Number(usd.toFixed(4))));

/** True when the browser knows the IANA zone (the API and database check it again). */
export function isValidTimeZone(zone: string): boolean {
	if (!zone || zone.length > 64 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(zone)) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** IANA zones for the pickers, UTC first. */
export function timeZoneOptions(): string[] {
	const intl = Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] };
	const zones = typeof intl.supportedValuesOf === "function" ? intl.supportedValuesOf("timeZone") : [];
	return ["UTC", ...zones.filter((zone) => zone !== "UTC")];
}

/** Whether the alert type compares against a base with percent thresholds. */
export function usesPercentBase(draft: Pick<SpendRuleDraft, "metric" | "forecastMode">): boolean {
	return draft.metric === "budget_percent" || (draft.metric === "forecast" && draft.forecastMode === "percent");
}

/** Only spend and budget_percent rules (not against the previous period) can block. */
export function canBlock(draft: Pick<SpendRuleDraft, "metric" | "baseKind">): boolean {
	return draft.metric === "spend" || (draft.metric === "budget_percent" && draft.baseKind !== "previous_period");
}

/**
 * A rule that can block every request in the workspace needs a typed confirmation when it is
 * saved enabled: on create, or when an edit makes it a workspace-wide block rule (turns it on,
 * switches it to blocking or widens its scope to the workspace).
 */
export function needsWorkspaceBlockConfirm(
	draft: Pick<SpendRuleDraft, "metric" | "baseKind" | "scopeType" | "action" | "enabled">,
	saved: Pick<SpendRule, "scope_type" | "action" | "enabled"> | null,
): boolean {
	if (!draft.enabled || draft.action !== "block" || draft.scopeType !== "workspace" || !canBlock(draft)) return false;
	return !saved || !(saved.enabled && saved.action === "block" && saved.scope_type === "workspace");
}

/** The typed confirmation matches the rule's name, ignoring surrounding spaces and case. */
export function workspaceBlockConfirmMatches(typed: string, name: string): boolean {
	const expected = name.trim().toLowerCase();
	return expected.length > 0 && typed.trim().toLowerCase() === expected;
}

/** Rolling, spike and balance rules repeat after a cooldown; calendar rules fire once a period. */
export function usesCooldown(draft: Pick<SpendRuleDraft, "metric" | "period">): boolean {
	return draft.period === "rolling" || draft.metric === "spike" || draft.metric === "balance";
}

/** The periods an alert type can use. */
export function periodsFor(draft: Pick<SpendRuleDraft, "metric" | "forecastMode" | "baseKind">): SpendRulePeriod[] {
	if (draft.metric === "spike" || draft.metric === "balance") return ["rolling"];
	if (draft.metric === "forecast") return ["day", "week", "month"];
	if (usesPercentBase(draft) && (draft.baseKind === "workspace_budget" || draft.baseKind === "key_limit")) return ["day", "week", "month"];
	return [...SPEND_RULE_PERIODS];
}

/** The bases the editor offers for the scope: a key limit only for the key scope. */
export function baseKindsFor(draft: Pick<SpendRuleDraft, "scopeType">): SpendRuleBaseKind[] {
	return SPEND_RULE_BASE_KINDS.filter((kind) => kind !== "key_limit" || draft.scopeType === "key");
}

export function emptyDraft(prefill: SpendRulePrefill = {}): SpendRuleDraft {
	const draft: SpendRuleDraft = {
		name: "",
		enabled: true,
		metric: "budget_percent",
		scopeType: "workspace",
		scopeId: "",
		period: "month",
		windowHours: String(DEFAULT_ROLLING_HOURS),
		timeZone: "",
		baseKind: "amount",
		baseAmountUsd: "",
		thresholdPercents: [...PRESET_THRESHOLDS],
		thresholdAmountUsd: "",
		forecastMode: "amount",
		runwayDays: "",
		spikeMultiplier: String(DEFAULT_SPIKE_MULTIPLIER),
		spikeFloorUsd: usdText(DEFAULT_SPIKE_FLOOR_NANOS / 1e9),
		cooldownMinutes: String(DEFAULT_COOLDOWN_MINUTES),
		action: "notify",
		blockAtPercent: String(DEFAULT_BLOCK_AT_PERCENT),
		blockAtAmountUsd: "",
		blockFreeModels: false,
		destinationIds: [],
	};
	let next = { ...draft, ...prefill, thresholdPercents: prefill.thresholdPercents ? [...prefill.thresholdPercents] : draft.thresholdPercents };
	if (prefill.metric) next = withMetric(next, prefill.metric);
	if (prefill.scopeType) next = withScope(next, prefill.scopeType, prefill.scopeId ?? "");
	if (prefill.baseKind) next = withBaseKind(next, prefill.baseKind);
	if (prefill.period) next = withPeriod(next, prefill.period);
	return next;
}

export function draftFromRule(rule: SpendRule): SpendRuleDraft {
	const base = emptyDraft();
	const forecastMode: ForecastMode = rule.metric === "forecast" && rule.threshold_amount_nanos === null ? "percent" : "amount";
	return {
		...base,
		name: rule.name,
		enabled: rule.enabled,
		metric: rule.metric,
		scopeType: rule.scope_type,
		scopeId: rule.scope_id ?? "",
		period: rule.period,
		windowHours: rule.window_hours === null ? base.windowHours : String(rule.window_hours),
		timeZone: rule.time_zone ?? "",
		baseKind: rule.base_kind ?? "amount",
		baseAmountUsd: usdText(rule.base_amount_usd),
		thresholdPercents: rule.threshold_percents ? [...rule.threshold_percents] : base.thresholdPercents,
		thresholdAmountUsd: usdText(rule.threshold_amount_usd),
		forecastMode,
		runwayDays: rule.runway_days === null ? "" : String(rule.runway_days),
		spikeMultiplier: rule.spike_multiplier === null ? base.spikeMultiplier : String(rule.spike_multiplier),
		spikeFloorUsd: rule.spike_floor_usd === null ? base.spikeFloorUsd : usdText(rule.spike_floor_usd),
		cooldownMinutes: String(rule.cooldown_minutes),
		action: rule.action,
		blockAtPercent: String(rule.block_at_percent),
		blockAtAmountUsd: usdText(rule.block_at_amount_usd),
		blockFreeModels: rule.block_free_models,
		destinationIds: [...rule.destination_ids],
	};
}

function fitPeriod(draft: SpendRuleDraft): SpendRuleDraft {
	const periods = periodsFor(draft);
	if (periods.includes(draft.period)) return draft;
	return withPeriod(draft, periods.includes("month") ? "month" : periods[0]!);
}

/** Changes the alert type and moves the other fields to something that type accepts. */
export function withMetric(draft: SpendRuleDraft, metric: SpendRuleMetric): SpendRuleDraft {
	let next: SpendRuleDraft = { ...draft, metric };
	if (metric === "balance") next = { ...next, scopeType: "workspace", scopeId: "" };
	if (metric === "spike" || metric === "balance") {
		const hours = metric === "spike" ? DEFAULT_SPIKE_WINDOW_HOURS : DEFAULT_BALANCE_LOOKBACK_HOURS;
		next = { ...next, period: "rolling", windowHours: draft.metric === metric ? draft.windowHours : String(hours) };
	}
	if (!canBlock(next)) next = { ...next, action: "notify" };
	return fitPeriod(next);
}

export function withScope(draft: SpendRuleDraft, scopeType: SpendRuleScope, scopeId = ""): SpendRuleDraft {
	let next: SpendRuleDraft = { ...draft, scopeType, scopeId: scopeType === "workspace" ? "" : scopeId };
	if (scopeType !== "workspace" && next.metric === "balance") next = withMetric(next, "budget_percent");
	if (scopeType !== "key" && next.baseKind === "key_limit") next = { ...next, baseKind: "amount" };
	return fitPeriod(next);
}

export function withBaseKind(draft: SpendRuleDraft, baseKind: SpendRuleBaseKind): SpendRuleDraft {
	let next: SpendRuleDraft = { ...draft, baseKind };
	if (!canBlock(next)) next = { ...next, action: "notify" };
	return fitPeriod(next);
}

export function withPeriod(draft: SpendRuleDraft, period: SpendRulePeriod): SpendRuleDraft {
	return { ...draft, period, windowHours: period === "rolling" && !draft.windowHours.trim() ? String(DEFAULT_ROLLING_HOURS) : draft.windowHours };
}

export function withForecastMode(draft: SpendRuleDraft, forecastMode: ForecastMode): SpendRuleDraft {
	return fitPeriod({ ...draft, forecastMode });
}

/** Adds a threshold chip (1 to 1000, at most 5, kept sorted and distinct). */
export function addThreshold(thresholds: readonly number[], value: string | number): number[] | null {
	const percent = typeof value === "number" ? value : wholeNumber(value.replace(/%$/, ""), 1, 1000);
	if (percent === null || !Number.isInteger(percent) || percent < 1 || percent > 1000) return null;
	if (thresholds.includes(percent)) return [...thresholds];
	if (thresholds.length >= MAX_SPEND_RULE_THRESHOLDS) return null;
	return [...thresholds, percent].sort((a, b) => a - b);
}

export function removeThreshold(thresholds: readonly number[], value: number): number[] {
	return thresholds.filter((percent) => percent !== value);
}

/** Field problems in form order, as message keys under SettingsUI.spendAlerts.issues. */
export function draftIssues(draft: SpendRuleDraft): DraftIssue[] {
	const issues: DraftIssue[] = [];
	const add = (field: DraftField, code: DraftIssueCode) => issues.push({ field, code });
	const percentBase = usesPercentBase(draft);
	if (!draft.name.trim() || draft.name.trim().length > 100) add("name", "nameRequired");
	if (draft.scopeType !== "workspace") {
		const id = draft.scopeId.trim();
		const needsUuid = draft.scopeType === "key" || draft.scopeType === "member" || draft.scopeType === "department";
		if (!id || id.length > 200 || (needsUuid && !UUID.test(id))) add("scopeId", "scopeRequired");
	}
	if (draft.period === "rolling" && wholeNumber(draft.windowHours, 1, 720) === null) add("windowHours", "windowHoursRange");
	else if (draft.metric === "spike" && wholeNumber(draft.windowHours, 1, MAX_SPIKE_WINDOW_HOURS) === null) add("windowHours", "spikeWindowRange");
	if (draft.timeZone && !isValidTimeZone(draft.timeZone)) add("timeZone", "timeZoneInvalid");
	if (percentBase) {
		if (draft.baseKind === "amount" && parseUsd(draft.baseAmountUsd) === null) add("baseAmountUsd", "amountInvalid");
		if ((draft.baseKind === "workspace_budget" || draft.baseKind === "key_limit") && !baseRefForPeriod(draft.period)) add("period", "baseNeedsCalendar");
		if (draft.baseKind === "key_limit" && draft.scopeType !== "key") add("baseKind", "keyLimitNeedsKey");
		if (draft.thresholdPercents.length === 0) add("thresholdPercents", "thresholdsRequired");
	}
	if ((draft.metric === "spend" || (draft.metric === "forecast" && draft.forecastMode === "amount")) && parseUsd(draft.thresholdAmountUsd) === null) {
		add("thresholdAmountUsd", "amountInvalid");
	}
	if (draft.metric === "balance") {
		const amount = draft.thresholdAmountUsd.trim();
		const runway = draft.runwayDays.trim();
		if (!amount && !runway) add("thresholdAmountUsd", "balanceNeedsTarget");
		if (amount && parseUsd(amount) === null) add("thresholdAmountUsd", "amountInvalid");
		if (runway && wholeNumber(runway, 1, 365) === null) add("runwayDays", "runwayRange");
	}
	if (draft.metric === "spike") {
		if (multiplier(draft.spikeMultiplier) === null) add("spikeMultiplier", "multiplierRange");
		if (parseUsd(draft.spikeFloorUsd, true) === null) add("spikeFloorUsd", "floorInvalid");
	}
	if (usesCooldown(draft) && wholeNumber(draft.cooldownMinutes, 5, 43_200) === null) add("cooldownMinutes", "cooldownRange");
	if (draft.action === "block" && canBlock(draft)) {
		if (draft.metric === "budget_percent") {
			const percent = wholeNumber(draft.blockAtPercent, 100, 1000);
			if (percent === null) add("blockAtPercent", "blockPercentRange");
			else if (draft.thresholdPercents.length && percent < Math.max(...draft.thresholdPercents)) add("blockAtPercent", "blockPercentBelowThreshold");
		} else {
			const block = parseUsd(draft.blockAtAmountUsd);
			const threshold = parseUsd(draft.thresholdAmountUsd);
			if (block === null) add("blockAtAmountUsd", "amountInvalid");
			else if (threshold !== null && block < threshold) add("blockAtAmountUsd", "blockAmountBelowThreshold");
		}
	}
	return issues;
}

/** The complete rule in the settings API's input shape (USD amounts, unused fields null). */
export function draftToPayload(draft: SpendRuleDraft): SpendRulePayload {
	const percentBase = usesPercentBase(draft);
	const usesAmount = draft.metric === "spend" || (draft.metric === "forecast" && draft.forecastMode === "amount")
		|| (draft.metric === "balance" && draft.thresholdAmountUsd.trim() !== "");
	const blocking = draft.action === "block" && canBlock(draft);
	const calendarBase = percentBase && (draft.baseKind === "workspace_budget" || draft.baseKind === "key_limit");
	return {
		name: draft.name.trim(),
		enabled: draft.enabled,
		metric: draft.metric,
		scope_type: draft.scopeType,
		scope_id: draft.scopeType === "workspace" ? null : draft.scopeId.trim() || null,
		period: draft.period,
		window_hours: draft.period === "rolling" ? wholeNumber(draft.windowHours, 1, 720) : null,
		time_zone: draft.timeZone.trim() || null,
		base_kind: percentBase ? draft.baseKind : null,
		base_ref: calendarBase ? baseRefForPeriod(draft.period) : null,
		base_amount_usd: percentBase && draft.baseKind === "amount" ? parseUsd(draft.baseAmountUsd) : null,
		threshold_percents: percentBase ? [...draft.thresholdPercents].sort((a, b) => a - b) : null,
		threshold_amount_usd: usesAmount ? parseUsd(draft.thresholdAmountUsd) : null,
		runway_days: draft.metric === "balance" && draft.runwayDays.trim() ? wholeNumber(draft.runwayDays, 1, 365) : null,
		spike_multiplier: draft.metric === "spike" ? multiplier(draft.spikeMultiplier) : null,
		spike_floor_usd: draft.metric === "spike" ? parseUsd(draft.spikeFloorUsd, true) : null,
		action: blocking ? "block" : "notify",
		block_at_percent: wholeNumber(draft.blockAtPercent, 100, 1000) ?? DEFAULT_BLOCK_AT_PERCENT,
		block_at_amount_usd: blocking && draft.metric === "spend" ? parseUsd(draft.blockAtAmountUsd) : null,
		block_free_models: blocking ? draft.blockFreeModels : false,
		cooldown_minutes: wholeNumber(draft.cooldownMinutes, 5, 43_200) ?? DEFAULT_COOLDOWN_MINUTES,
		destination_ids: [...new Set(draft.destinationIds)],
	};
}

/**
 * Field issues first (translatable); then the shared validator, so anything else the API would
 * reject is caught before the request with the API's own message.
 */
export function checkDraft(draft: SpendRuleDraft): DraftCheck {
	const issues = draftIssues(draft);
	if (issues.length) return { ok: false, issues, message: null };
	const payload = draftToPayload(draft);
	// The server refuses a new block while blocks are off; the editor only offers block then.
	const parsed = parseSpendRuleInput(payload, { parseTimeZone: (value) => (typeof value === "string" && isValidTimeZone(value.trim()) ? value.trim() : null), blocksEnabled: true });
	if (parsed.ok === false) return { ok: false, issues: [], message: parsed.message };
	return { ok: true, payload };
}

/** Whether the evaluator sends this rule today (otherwise it is saved and shown as not evaluated). */
export function draftEvaluated(draft: SpendRuleDraft): boolean {
	const payload = draftToPayload(draft);
	return isSpendRuleEvaluated({ metric: draft.metric, period: draft.period, base_kind: (payload.base_kind as string | null) ?? null });
}

export type SpendRuleBaseOptions = {
	keys: Array<{ id: string; limitsUsd: { daily: number | null; weekly: number | null; monthly: number | null } }>;
	budgetsUsd: Partial<Record<string, number | null>>;
};

/** The base in USD as far as the page knows it (null for previous_period or a missing base). */
export function draftBaseUsd(draft: SpendRuleDraft, options: SpendRuleBaseOptions): number | null {
	if (!usesPercentBase(draft)) return null;
	const ref = baseRefForPeriod(draft.period);
	if (draft.baseKind === "amount") return parseUsd(draft.baseAmountUsd);
	if (draft.baseKind === "workspace_budget") return ref ? options.budgetsUsd[ref] ?? null : null;
	if (draft.baseKind === "key_limit") {
		const key = options.keys.find((entry) => entry.id === draft.scopeId);
		return ref && key ? key.limitsUsd[ref] ?? null : null;
	}
	return null;
}

/** The dollar amount each threshold fires at, for a known base. */
export function thresholdAmountsUsd(thresholds: readonly number[], baseUsd: number | null): Array<{ percent: number; usd: number }> {
	if (baseUsd === null || !(baseUsd > 0)) return [];
	return thresholds.map((percent) => ({ percent, usd: Math.round(baseUsd * percent) / 100 }));
}

export type PreviewSummary =
	| { kind: "ofBase"; valueUsd: number; baseUsd: number; percent: number }
	| { kind: "value"; valueUsd: number }
	/** Balance rules: the available balance, the burn per day over the window and the runway (null without spend). */
	| { kind: "balance"; availableUsd: number; burnPerDayUsd: number; runwayDays: number | null; windowHours: number }
	/**
	 * Forecast rules: spend so far, the projection to the period end (`by`), and when the pace
	 * reaches the limit (the amount, else the base) if it does this period. Times are shown in
	 * the rule's zone.
	 */
	| { kind: "forecast"; valueUsd: number; projectedUsd: number; by: string; reachesAt: string | null; limitUsd: number | null; timeZone: string }
	/** Forecast rules early in the period: spend so far and when the projection starts. */
	| { kind: "forecastPending"; valueUsd: number; from: string | null; timeZone: string }
	/**
	 * Spike rules: spend over the window against the median of the same window over the past 7
	 * days (multiple null when that median is 0), and what the window must reach to fire.
	 */
	| { kind: "spike"; currentUsd: number; baselineUsd: number; multiple: number | null; firesAtUsd: number; windowHours: number; spiking: boolean }
	/** Spike rules without enough history yet: the workspace must spend in at least `needed` baseline windows. */
	| { kind: "spikePending"; currentUsd: number; windowHours: number; activeWindows: number; baselineWindows: number; needed: number };

/** "Currently $42.10 of $100 (42%)": the value against the base, or a spend rule's amount. */
export function previewSummary(preview: SpendRulePreview | null | undefined, rule: Pick<SpendRule, "metric" | "threshold_amount_usd"> | null): PreviewSummary | null {
	if (!preview || !preview.evaluated) return null;
	if (preview.balance) {
		const balance = preview.balance;
		return { kind: "balance", availableUsd: balance.available_usd, burnPerDayUsd: balance.burn_per_day_usd, runwayDays: balance.runway_days_left, windowHours: balance.window_hours };
	}
	if (preview.spike) {
		const spike = preview.spike;
		if (!spike.history_ready) {
			return { kind: "spikePending", currentUsd: spike.current_usd, windowHours: spike.window_hours, activeWindows: spike.active_windows, baselineWindows: spike.baseline_windows, needed: SPIKE_MIN_BASELINE_WINDOWS };
		}
		return { kind: "spike", currentUsd: spike.current_usd, baselineUsd: spike.baseline_usd, multiple: spike.multiple, firesAtUsd: spike.fires_at_usd, windowHours: spike.window_hours, spiking: spike.spiking };
	}
	if (preview.value_usd === null) return null;
	const valueUsd = preview.value_usd;
	if (preview.forecast) {
		const forecast = preview.forecast;
		if (!forecast.ready || forecast.projected_usd === null) return { kind: "forecastPending", valueUsd, from: forecast.from, timeZone: preview.time_zone };
		return { kind: "forecast", valueUsd, projectedUsd: forecast.projected_usd, by: forecast.by, reachesAt: forecast.reaches_at, limitUsd: forecast.limit_usd, timeZone: preview.time_zone };
	}
	if (preview.base_usd !== null && preview.base_usd > 0) {
		return { kind: "ofBase", valueUsd, baseUsd: preview.base_usd, percent: preview.percent ?? (valueUsd / preview.base_usd) * 100 };
	}
	const amount = preview.threshold_amount_usd ?? (rule?.metric === "spend" ? rule.threshold_amount_usd : null);
	if (amount !== null && amount > 0) return { kind: "ofBase", valueUsd, baseUsd: amount, percent: (valueUsd / amount) * 100 };
	return { kind: "value", valueUsd };
}

/** Prefill from a shortcut link: /settings/notifications?spendAlert=new&scope=key&… */
export function prefillFromSearchParams(params: Pick<URLSearchParams, "get">): SpendRulePrefill | null {
	if (params.get("spendAlert") !== "new") return null;
	const prefill: SpendRulePrefill = {};
	const metric = params.get("metric");
	if (oneOf(SPEND_RULE_METRICS, metric)) prefill.metric = metric;
	const scope = params.get("scope");
	const scopeId = params.get("scopeId")?.trim() ?? "";
	if (oneOf(SPEND_RULE_SCOPES, scope) && (scope === "workspace" || (scopeId && scopeId.length <= 200))) {
		prefill.scopeType = scope;
		if (scope !== "workspace") prefill.scopeId = scopeId;
	}
	const period = params.get("period");
	if (oneOf(SPEND_RULE_PERIODS, period)) prefill.period = period;
	const base = params.get("base");
	if (oneOf(SPEND_RULE_BASE_KINDS, base)) prefill.baseKind = base;
	// Malformed values are skipped; the rest are kept (at most five).
	const thresholds = (params.get("thresholds") ?? "").split(",").reduce<number[]>((list, value) => (value ? addThreshold(list, value) ?? list : list), []);
	if (thresholds.length) prefill.thresholdPercents = thresholds;
	const name = params.get("name")?.trim();
	if (name) prefill.name = name.slice(0, 100);
	return prefill;
}

/** A link that opens the editor on Settings → Notifications, prefilled. */
export function spendAlertHref(prefill: SpendRulePrefill): string {
	const params = new URLSearchParams({ spendAlert: "new" });
	if (prefill.metric) params.set("metric", prefill.metric);
	if (prefill.scopeType) params.set("scope", prefill.scopeType);
	if (prefill.scopeId) params.set("scopeId", prefill.scopeId);
	if (prefill.period) params.set("period", prefill.period);
	if (prefill.baseKind) params.set("base", prefill.baseKind);
	if (prefill.thresholdPercents?.length) params.set("thresholds", prefill.thresholdPercents.join(","));
	if (prefill.name) params.set("name", prefill.name);
	return `/settings/notifications?${params.toString()}#${SPEND_ALERT_ANCHOR}`;
}

/** The shortcut from a key's page: 80% of its daily, weekly or monthly cost limit. */
export function keyLimitAlertPrefill(keyId: string, ref: SpendRuleBaseRef, name?: string): SpendRulePrefill {
	return { metric: "budget_percent", scopeType: "key", scopeId: keyId, baseKind: "key_limit", period: periodForBaseRef(ref), thresholdPercents: [KEY_LIMIT_ALERT_PERCENT], ...(name ? { name } : {}) };
}

/** The shortcut from the budgets page: 50/80/100% of a daily, weekly or monthly workspace budget. */
export function budgetAlertPrefill(ref: SpendRuleBaseRef, name?: string): SpendRulePrefill {
	return { metric: "budget_percent", scopeType: "workspace", baseKind: "workspace_budget", period: periodForBaseRef(ref), thresholdPercents: [...PRESET_THRESHOLDS], ...(name ? { name } : {}) };
}
