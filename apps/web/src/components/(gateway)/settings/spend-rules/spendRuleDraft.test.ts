import {
	addThreshold,
	budgetAlertPrefill,
	canBlock,
	checkDraft,
	draftBaseUsd,
	draftEvaluated,
	draftFromRule,
	draftIssues,
	draftToPayload,
	emptyDraft,
	isValidTimeZone,
	keyLimitAlertPrefill,
	parseUsd,
	periodsFor,
	prefillFromSearchParams,
	previewSummary,
	removeThreshold,
	spendAlertHref,
	thresholdAmountsUsd,
	timeZoneOptions,
	withBaseKind,
	withMetric,
	withScope,
	type SpendRuleDraft,
} from "./spendRuleDraft";
import { parseSpendRuleInput, SPEND_RULE_BLOCKS_AVAILABLE, type SpendRule, type SpendRulePreview } from "./spendRules";

const KEY = "00000000-0000-4000-8000-0000000000a1";
const DEST = "00000000-0000-4000-8000-0000000000e1";

function rule(overrides: Partial<SpendRule> = {}): SpendRule {
	return {
		id: "r1", workspace_id: "w1", name: "Monthly", enabled: true, metric: "budget_percent", evaluated: true,
		scope_type: "workspace", scope_id: null, period: "month", window_hours: null, time_zone: null,
		base_kind: "amount", base_ref: null, base_amount_nanos: 100e9, base_amount_usd: 100,
		threshold_percents: [50, 80, 100], threshold_amount_nanos: null, threshold_amount_usd: null,
		runway_days: null, spike_multiplier: null, spike_floor_nanos: null, spike_floor_usd: null,
		action: "notify", block_at_percent: 110, block_at_amount_nanos: null, block_at_amount_usd: null,
		block_free_models: false, cooldown_minutes: 360, destination_ids: [DEST],
		created_by: null, created_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T12:00:00Z", ...overrides,
	};
}

const draft = (overrides: Partial<SpendRuleDraft> = {}): SpendRuleDraft => ({ ...emptyDraft(), name: "Monthly", baseAmountUsd: "100", ...overrides });
const codes = (value: SpendRuleDraft) => draftIssues(value).map((issue) => `${issue.field}:${issue.code}`);
const accepted = (payload: Record<string, unknown>) => parseSpendRuleInput(payload, { parseTimeZone: (zone) => (typeof zone === "string" ? zone : null) }).ok;

describe("parseUsd", () => {
	it("takes plain dollar amounts with up to four decimals", () => {
		expect(parseUsd("100")).toBe(100);
		expect(parseUsd(" 42.10 ")).toBe(42.1);
		expect(parseUsd(".5")).toBe(0.5);
		expect(parseUsd("0.0001")).toBe(0.0001);
	});

	it("rejects zero (unless allowed), negatives, symbols and too many decimals", () => {
		expect(parseUsd("0")).toBeNull();
		expect(parseUsd("0", true)).toBe(0);
		expect(parseUsd("-1")).toBeNull();
		expect(parseUsd("$5")).toBeNull();
		expect(parseUsd("1,000")).toBeNull();
		expect(parseUsd("1.00001")).toBeNull();
		expect(parseUsd("")).toBeNull();
		expect(parseUsd("1e3")).toBeNull();
	});
});

describe("threshold chips", () => {
	it("adds sorted, distinct percentages up to five", () => {
		expect(addThreshold([50, 100], "80")).toEqual([50, 80, 100]);
		expect(addThreshold([50, 100], "80%")).toEqual([50, 80, 100]);
		expect(addThreshold([50], 50)).toEqual([50]);
		expect(addThreshold([10, 20, 30, 40, 50], "60")).toBeNull();
		expect(addThreshold([], "0")).toBeNull();
		expect(addThreshold([], "1001")).toBeNull();
		expect(addThreshold([], "12.5")).toBeNull();
		expect(removeThreshold([50, 80, 100], 80)).toEqual([50, 100]);
	});
});

describe("keeping the draft consistent", () => {
	it("starts as a monthly 50/80/100% alert for the workspace", () => {
		const value = emptyDraft();
		expect(value).toMatchObject({ metric: "budget_percent", scopeType: "workspace", period: "month", baseKind: "amount", thresholdPercents: [50, 80, 100], action: "notify", blockAtPercent: "110", blockFreeModels: false, timeZone: "" });
	});

	it("moves spike and balance rules to a rolling window and balance to the workspace", () => {
		const spike = withMetric(draft({ scopeType: "key", scopeId: KEY }), "spike");
		expect(spike).toMatchObject({ period: "rolling", windowHours: "6", scopeType: "key" });
		const balance = withMetric(draft({ scopeType: "key", scopeId: KEY }), "balance");
		expect(balance).toMatchObject({ period: "rolling", windowHours: "168", scopeType: "workspace", scopeId: "" });
		expect(withScope(balance, "member", "u")).toMatchObject({ metric: "budget_percent", scopeType: "member" });
	});

	it("only offers calendar periods for budget and key limit bases and forecasts", () => {
		expect(periodsFor({ metric: "budget_percent", forecastMode: "amount", baseKind: "amount" })).toContain("rolling");
		expect(periodsFor({ metric: "budget_percent", forecastMode: "amount", baseKind: "workspace_budget" })).toEqual(["day", "week", "month"]);
		expect(periodsFor({ metric: "forecast", forecastMode: "amount", baseKind: "amount" })).toEqual(["day", "week", "month"]);
		expect(withBaseKind(draft({ period: "rolling" }), "workspace_budget").period).toBe("month");
	});

	it("drops the key limit base and blocking when they no longer apply", () => {
		const keyRule = withBaseKind(withScope(draft(), "key", KEY), "key_limit");
		expect(keyRule.baseKind).toBe("key_limit");
		expect(withScope(keyRule, "workspace").baseKind).toBe("amount");
		const blocking = draft({ action: "block" });
		expect(withBaseKind(blocking, "previous_period").action).toBe("notify");
		expect(withMetric(blocking, "forecast").action).toBe("notify");
		expect(canBlock({ metric: "spend", baseKind: "amount" })).toBe(true);
		expect(canBlock({ metric: "spike", baseKind: "amount" })).toBe(false);
	});
});

describe("draftIssues", () => {
	it("accepts the default alert once it has a name and an amount", () => {
		expect(codes(draft())).toEqual([]);
	});

	it("names each field that needs attention", () => {
		expect(codes(draft({ name: " ", baseAmountUsd: "0", thresholdPercents: [] }))).toEqual([
			"name:nameRequired", "baseAmountUsd:amountInvalid", "thresholdPercents:thresholdsRequired",
		]);
		expect(codes(draft({ scopeType: "key", scopeId: "" }))).toEqual(["scopeId:scopeRequired"]);
		expect(codes(draft({ scopeType: "key", scopeId: "not-a-uuid" }))).toEqual(["scopeId:scopeRequired"]);
		expect(codes(draft({ scopeType: "model", scopeId: "openai/gpt-5" }))).toEqual([]);
		expect(codes(draft({ period: "rolling", windowHours: "721" }))).toEqual(["windowHours:windowHoursRange"]);
		expect(codes(draft({ timeZone: "Nowhere/Land" }))).toEqual(["timeZone:timeZoneInvalid"]);
	});

	it("checks the grace margin against the thresholds", () => {
		expect(codes(draft({ action: "block", blockAtPercent: "90" }))).toEqual(["blockAtPercent:blockPercentRange"]);
		expect(codes(draft({ action: "block", thresholdPercents: [50, 120], blockAtPercent: "110" }))).toEqual(["blockAtPercent:blockPercentBelowThreshold"]);
		const spend = withMetric(draft({ thresholdAmountUsd: "100" }), "spend");
		expect(codes({ ...spend, action: "block", blockAtAmountUsd: "" })).toEqual(["blockAtAmountUsd:amountInvalid"]);
		expect(codes({ ...spend, action: "block", blockAtAmountUsd: "90" })).toEqual(["blockAtAmountUsd:blockAmountBelowThreshold"]);
		expect(codes({ ...spend, action: "block", blockAtAmountUsd: "110" })).toEqual([]);
	});

	it("needs a balance amount or a runway, and valid spike settings", () => {
		const balance = withMetric(draft(), "balance");
		expect(codes(balance)).toEqual(["thresholdAmountUsd:balanceNeedsTarget"]);
		expect(codes({ ...balance, runwayDays: "400" })).toEqual(["runwayDays:runwayRange"]);
		expect(codes({ ...balance, runwayDays: "7" })).toEqual([]);
		const spike = withMetric(draft(), "spike");
		expect(codes({ ...spike, spikeMultiplier: "1", spikeFloorUsd: "-1", cooldownMinutes: "1" })).toEqual([
			"spikeMultiplier:multiplierRange", "spikeFloorUsd:floorInvalid", "cooldownMinutes:cooldownRange",
		]);
		expect(codes({ ...spike, spikeFloorUsd: "0" })).toEqual([]);
	});
});

describe("draftToPayload", () => {
	it("sends a complete percent rule with unused fields as null", () => {
		const payload = draftToPayload(draft({ destinationIds: [DEST, DEST] }));
		expect(payload).toEqual({
			name: "Monthly", enabled: true, metric: "budget_percent", scope_type: "workspace", scope_id: null,
			period: "month", window_hours: null, time_zone: null, base_kind: "amount", base_ref: null, base_amount_usd: 100,
			threshold_percents: [50, 80, 100], threshold_amount_usd: null, runway_days: null, spike_multiplier: null, spike_floor_usd: null,
			action: "notify", block_at_percent: 110, block_at_amount_usd: null, block_free_models: false, cooldown_minutes: 360,
			destination_ids: [DEST],
		});
		expect(accepted(payload)).toBe(true);
	});

	it("derives base_ref from the period for budget and key limit bases", () => {
		const budget = draftToPayload(withBaseKind(draft({ period: "week" }), "workspace_budget"));
		expect(budget).toMatchObject({ base_kind: "workspace_budget", base_ref: "weekly", base_amount_usd: null, period: "week" });
		expect(accepted(budget)).toBe(true);
		const key = draftToPayload(withBaseKind(withScope(draft({ period: "day" }), "key", KEY), "key_limit"));
		expect(key).toMatchObject({ scope_type: "key", scope_id: KEY, base_kind: "key_limit", base_ref: "daily" });
		expect(accepted(key)).toBe(true);
	});

	it("sends a spend rule that blocks, with free models still exempt by default", () => {
		const spend = { ...withMetric(draft({ thresholdAmountUsd: "100" }), "spend"), action: "block" as const, blockAtAmountUsd: "110" };
		const payload = draftToPayload(spend);
		expect(payload).toMatchObject({ metric: "spend", threshold_amount_usd: 100, block_at_amount_usd: 110, action: "block", block_free_models: false, base_kind: null, threshold_percents: null });
		// The API refuses block rules until blocks are enforced.
		expect(accepted(payload)).toBe(SPEND_RULE_BLOCKS_AVAILABLE);
		expect(draftToPayload({ ...spend, blockFreeModels: true }).block_free_models).toBe(true);
	});

	it("never sends a block for a type that cannot block, nor block fields for a notify rule", () => {
		const payload = draftToPayload({ ...withMetric(draft({ thresholdAmountUsd: "50" }), "forecast"), action: "block", blockAtAmountUsd: "9", blockFreeModels: true });
		expect(payload).toMatchObject({ action: "notify", block_at_amount_usd: null, block_free_models: false, threshold_amount_usd: 50, base_kind: null });
		expect(accepted(payload)).toBe(true);
	});

	it("shapes forecast by percent, spike and balance rules", () => {
		const forecast = draftToPayload({ ...withMetric(draft(), "forecast"), forecastMode: "percent", baseKind: "previous_period" });
		expect(forecast).toMatchObject({ base_kind: "previous_period", base_amount_usd: null, threshold_percents: [50, 80, 100], threshold_amount_usd: null });
		expect(accepted(forecast)).toBe(true);
		const spike = draftToPayload(withMetric(draft(), "spike"));
		expect(spike).toMatchObject({ period: "rolling", window_hours: 6, spike_multiplier: 3, spike_floor_usd: 5, base_kind: null, threshold_percents: null });
		expect(accepted(spike)).toBe(true);
		const balance = draftToPayload({ ...withMetric(draft(), "balance"), runwayDays: "7" });
		expect(balance).toMatchObject({ scope_type: "workspace", period: "rolling", window_hours: 168, runway_days: 7, threshold_amount_usd: null });
		expect(accepted(balance)).toBe(true);
	});

	it("keeps a rule's own time zone and sends null for the workspace default", () => {
		expect(draftToPayload(draft({ timeZone: "America/New_York" })).time_zone).toBe("America/New_York");
		expect(draftToPayload(draft({ timeZone: "" })).time_zone).toBeNull();
	});
});

describe("checkDraft", () => {
	it("returns the payload when valid, field issues when not", () => {
		expect(checkDraft(draft())).toMatchObject({ ok: true, payload: { name: "Monthly" } });
		expect(checkDraft(draft({ name: "" }))).toEqual({ ok: false, issues: [{ field: "name", code: "nameRequired" }], message: null });
	});
});

describe("draftFromRule", () => {
	it("round-trips a stored rule through the form", () => {
		const stored = rule({ time_zone: "Europe/London", action: "block", block_at_percent: 120 });
		const value = draftFromRule(stored);
		expect(value).toMatchObject({ name: "Monthly", baseAmountUsd: "100", timeZone: "Europe/London", action: "block", blockAtPercent: "120", destinationIds: [DEST] });
		expect(draftToPayload(value)).toMatchObject({ base_amount_usd: 100, action: "block", block_at_percent: 120, time_zone: "Europe/London", threshold_percents: [50, 80, 100] });
	});

	it("reads a forecast without an amount as a percent forecast", () => {
		expect(draftFromRule(rule({ metric: "forecast" })).forecastMode).toBe("percent");
		expect(draftFromRule(rule({ metric: "forecast", base_kind: null, threshold_percents: null, threshold_amount_usd: 50, threshold_amount_nanos: 50e9 })).forecastMode).toBe("amount");
	});
});

describe("evaluation and bases", () => {
	it("knows which drafts the evaluator sends today", () => {
		expect(draftEvaluated(draft())).toBe(true);
		expect(draftEvaluated(draft({ period: "rolling" }))).toBe(false);
		expect(draftEvaluated(withMetric(draft(), "spike"))).toBe(false);
		expect(draftEvaluated(withBaseKind(draft(), "previous_period"))).toBe(false);
	});

	it("finds the base from the budgets and key limits it was given", () => {
		const options = { budgetsUsd: { monthly: 500, weekly: null }, keys: [{ id: KEY, limitsUsd: { daily: 10, weekly: null, monthly: null } }] };
		expect(draftBaseUsd(draft(), options)).toBe(100);
		expect(draftBaseUsd(withBaseKind(draft(), "workspace_budget"), options)).toBe(500);
		expect(draftBaseUsd(withBaseKind(draft({ period: "week" }), "workspace_budget"), options)).toBeNull();
		expect(draftBaseUsd(withBaseKind(withScope(draft({ period: "day" }), "key", KEY), "key_limit"), options)).toBe(10);
		expect(thresholdAmountsUsd([50, 80], 500)).toEqual([{ percent: 50, usd: 250 }, { percent: 80, usd: 400 }]);
		expect(thresholdAmountsUsd([50], null)).toEqual([]);
	});
});

describe("previewSummary", () => {
	const preview = (overrides: Partial<SpendRulePreview>): SpendRulePreview => ({
		rule_id: "r1", metric: "budget_percent", evaluated: true, computed_at: "", time_zone: "UTC", period: null,
		value_nanos: 42.1e9, value_usd: 42.1, base_kind: "amount", base_ref: null, base_nanos: 100e9, base_usd: 100, percent: 42.1,
		threshold_percents: [50], threshold_amount_nanos: null, threshold_amount_usd: null, reached_threshold_percent: null,
		next_threshold: null, block_at_nanos: null, block_at_usd: null, state: null, alert: null, ...overrides,
	});

	it("shows the value against the base or the spend amount", () => {
		expect(previewSummary(preview({}), null)).toEqual({ kind: "ofBase", valueUsd: 42.1, baseUsd: 100, percent: 42.1 });
		expect(previewSummary(preview({ base_usd: null, base_nanos: null, percent: null, threshold_amount_usd: 200 }), null)).toEqual({ kind: "ofBase", valueUsd: 42.1, baseUsd: 200, percent: 21.05 });
		expect(previewSummary(preview({ base_usd: null, percent: null }), null)).toEqual({ kind: "value", valueUsd: 42.1 });
	});

	it("has nothing to show for rules that are not evaluated", () => {
		expect(previewSummary(preview({ evaluated: false }), null)).toBeNull();
		expect(previewSummary(preview({ value_usd: null }), null)).toBeNull();
		expect(previewSummary(null, null)).toBeNull();
	});
});

describe("shortcut links", () => {
	it("round-trips the key limit shortcut through the URL", () => {
		const href = spendAlertHref(keyLimitAlertPrefill(KEY, "monthly", "prod: 80% of monthly limit"));
		expect(href.startsWith("/settings/notifications?spendAlert=new&")).toBe(true);
		expect(href.endsWith("#spend-alerts")).toBe(true);
		const prefill = prefillFromSearchParams(new URL(href, "https://phaseo.app").searchParams);
		expect(prefill).toEqual({ metric: "budget_percent", scopeType: "key", scopeId: KEY, baseKind: "key_limit", period: "month", thresholdPercents: [80], name: "prod: 80% of monthly limit" });
		expect(emptyDraft(prefill!)).toMatchObject({ scopeType: "key", scopeId: KEY, baseKind: "key_limit", period: "month", thresholdPercents: [80] });
		expect(codes(emptyDraft(prefill!))).toEqual([]);
	});

	it("round-trips the budget shortcut", () => {
		const prefill = prefillFromSearchParams(new URL(spendAlertHref(budgetAlertPrefill("weekly")), "https://phaseo.app").searchParams);
		expect(prefill).toEqual({ metric: "budget_percent", scopeType: "workspace", baseKind: "workspace_budget", period: "week", thresholdPercents: [50, 80, 100] });
	});

	it("ignores unknown or malformed values", () => {
		expect(prefillFromSearchParams(new URLSearchParams("scope=key"))).toBeNull();
		expect(prefillFromSearchParams(new URLSearchParams("spendAlert=new&metric=nope&scope=key&period=year&base=x&thresholds=0,abc,80"))).toEqual({ thresholdPercents: [80] });
	});
});

describe("time zones", () => {
	it("validates IANA names and lists UTC first", () => {
		expect(isValidTimeZone("Europe/London")).toBe(true);
		expect(isValidTimeZone("UTC")).toBe(true);
		expect(isValidTimeZone("Nowhere/Land")).toBe(false);
		expect(isValidTimeZone("+01:00")).toBe(false);
		const zones = timeZoneOptions();
		expect(zones[0]).toBe("UTC");
		expect(zones.filter((zone) => zone === "UTC")).toHaveLength(1);
	});
});
