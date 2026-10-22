import { NANOS_PER_USD, PLAN_TIERS, slackAgentPlanNanos } from "@/billing/slackAgentPricing";

// Validation for the Slack agent's settings. The API speaks dollars; the table
// stores nanodollars. The limits mirror the slack_installations constraints so a
// bad value is a clear 400 here rather than a constraint error.

export const STANDARD_PLAN_PEOPLE: readonly number[] = PLAN_TIERS.map((tier) => tier.people);
export const MIN_CUSTOM_PLAN_PEOPLE = 101;
export const MAX_PLAN_PEOPLE = 10_000_000;
/** The largest monthly spending cap or key limit, in dollars. */
export const MAX_MONTHLY_USD = 100_000;
export const MAX_INSTRUCTIONS_CHARS = 8_000;
export const MAX_USAGE_DATA_CHANNELS = 100;
export const MAX_ANSWERS_PER_PERSON_HOUR = 10_000;
export const DEFAULT_SLACK_AGENT_MODEL = "phaseo/auto";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
/** Public (C) and private (G) Slack channel ids. */
const CHANNEL_PATTERN = /^[CG][A-Z0-9]{2,31}$/;

export type OverPlan = "refuse" | "move_up";
export type AccessMode = "everyone" | "linked";
export type UsageDataMode = "off" | "dm" | "dm_and_channels";
export type SlackAgentStatusChange = "active" | "paused";

type Result<T> = { ok: true; value: T } | { ok: false; message: string };
type Body = Record<string, unknown>;

/** What an admin picks before installing. It travels in the signed OAuth state, in API units. */
export type SlackAgentInstallSettings = {
	plan_people: number;
	over_plan: OverPlan;
	max_people: number | null;
	monthly_cap_usd: number;
	token_monthly_limit_usd: number;
	model: string;
	access_mode: AccessMode;
	usage_data_mode: UsageDataMode;
	slack_app_id: string | null;
};

/** Columns of slack_installations a PATCH may change (status is handled separately). */
export type SlackAgentRowUpdate = Partial<{
	plan_people: number;
	over_plan: OverPlan;
	max_people: number | null;
	monthly_cap_nanos: number;
	answers_per_person_hour: number;
	model: string;
	instructions: string | null;
	access_mode: AccessMode;
	usage_data_mode: UsageDataMode;
	usage_data_channel_ids: string[];
	allow_guests: boolean;
	allow_external_users: boolean;
}>;

export type SlackAgentPatch = {
	update: SlackAgentRowUpdate;
	keyMonthlyLimitNanos?: number;
	status?: SlackAgentStatusChange;
	changedFields: string[];
};

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

export function usdToNanos(usd: number): number {
	return Math.round(usd * NANOS_PER_USD);
}

export function nanosToUsd(nanos: unknown): number {
	const value = Number(nanos);
	return Number.isFinite(value) ? value / NANOS_PER_USD : 0;
}

function integer(value: unknown, field: string, min: number, max: number): Result<number> {
	if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
		return fail(`${field} must be a whole number from ${min.toLocaleString("en-US")} to ${max.toLocaleString("en-US")}`);
	}
	return ok(value);
}

export function parsePlanPeople(value: unknown): Result<number> {
	if (typeof value === "number" && Number.isInteger(value)
		&& (STANDARD_PLAN_PEOPLE.includes(value) || (value >= MIN_CUSTOM_PLAN_PEOPLE && value <= MAX_PLAN_PEOPLE))) {
		return ok(value);
	}
	return fail(`plan_people must be ${STANDARD_PLAN_PEOPLE.join(", ")}, or a whole number from ${MIN_CUSTOM_PLAN_PEOPLE} to ${MAX_PLAN_PEOPLE.toLocaleString("en-US")}`);
}

function oneOf<T extends string>(value: unknown, field: string, options: readonly T[]): Result<T> {
	return typeof value === "string" && (options as readonly string[]).includes(value)
		? ok(value as T)
		: fail(`${field} must be one of: ${options.join(", ")}`);
}

function maxPeople(value: unknown): Result<number | null> {
	if (value === null) return ok(null);
	return integer(value, "max_people", 1, MAX_PLAN_PEOPLE);
}

function usd(value: unknown, field: string, allowZero: boolean): Result<number> {
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (!allowZero && value <= 0) || value > MAX_MONTHLY_USD) {
		return fail(`${field} must be ${allowZero ? "from 0" : "more than 0"} up to ${MAX_MONTHLY_USD.toLocaleString("en-US")} dollars`);
	}
	// Whole nanodollars; anything finer than that is rounding noise.
	return ok(usdToNanos(value) / NANOS_PER_USD);
}

function model(value: unknown): Result<string> {
	const text = typeof value === "string" ? value.trim() : "";
	return MODEL_PATTERN.test(text) ? ok(text) : fail("model must be a model id such as phaseo/auto");
}

function instructions(value: unknown): Result<string | null> {
	if (value === null) return ok(null);
	if (typeof value !== "string") return fail("instructions must be text");
	const text = value.trim();
	// Postgres length() counts code points, so count them the same way.
	if ([...text].length > MAX_INSTRUCTIONS_CHARS) return fail(`instructions must be at most ${MAX_INSTRUCTIONS_CHARS.toLocaleString("en-US")} characters`);
	return ok(text || null);
}

function channelIds(value: unknown): Result<string[]> {
	if (!Array.isArray(value)) return fail("usage_data_channel_ids must be a list of Slack channel ids");
	const ids = [...new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")))];
	if (ids.length > MAX_USAGE_DATA_CHANNELS) return fail(`usage_data_channel_ids can list at most ${MAX_USAGE_DATA_CHANNELS} channels`);
	if (ids.some((id) => !CHANNEL_PATTERN.test(id))) return fail("usage_data_channel_ids must be Slack channel ids such as C0123ABCD");
	return ok(ids);
}

function bool(value: unknown, field: string): Result<boolean> {
	return typeof value === "boolean" ? ok(value) : fail(`${field} must be true or false`);
}

function unknownField(body: Body, allowed: ReadonlySet<string>): string | null {
	return Object.keys(body).find((field) => !allowed.has(field)) ?? null;
}

/**
 * A plan's people limit, hard limit and spending cap must agree: the hard limit
 * can't be below the plan, and the cap must at least cover the plan's price.
 */
export function planProblem(values: { plan_people: number; max_people: number | null; monthly_cap_nanos: number }): string | null {
	if (values.max_people != null && values.max_people < values.plan_people) return "max_people must be at least plan_people";
	const planNanos = slackAgentPlanNanos(values.plan_people);
	if (values.monthly_cap_nanos < planNanos) {
		return `monthly_cap_usd must be at least the plan's price ($${(planNanos / NANOS_PER_USD).toFixed(2)})`;
	}
	return null;
}

const INSTALL_FIELDS = new Set([
	"workspaceId", "plan_people", "over_plan", "max_people", "monthly_cap_usd", "token_monthly_limit_usd",
	"model", "access_mode", "usage_data_mode", "slack_app_id",
]);

/** Validates an install request (and, on the callback, the settings carried in the signed state). */
export function parseInstallSettings(body: Body): Result<SlackAgentInstallSettings> {
	const unknown = unknownField(body, INSTALL_FIELDS);
	if (unknown) return fail(`Unknown field: ${unknown}`);
	const planPeople = parsePlanPeople(body.plan_people ?? STANDARD_PLAN_PEOPLE[0]);
	if (planPeople.ok === false) return fail(planPeople.message);
	const overPlan = oneOf<OverPlan>(body.over_plan ?? "refuse", "over_plan", ["refuse", "move_up"]);
	if (overPlan.ok === false) return fail(overPlan.message);
	const max = maxPeople(body.max_people ?? null);
	if (max.ok === false) return fail(max.message);
	if (body.monthly_cap_usd === undefined) return fail("monthly_cap_usd is required");
	const cap = usd(body.monthly_cap_usd, "monthly_cap_usd", false);
	if (cap.ok === false) return fail(cap.message);
	const keyLimit = usd(body.token_monthly_limit_usd ?? 0, "token_monthly_limit_usd", true);
	if (keyLimit.ok === false) return fail(keyLimit.message);
	const chosenModel = model(body.model ?? DEFAULT_SLACK_AGENT_MODEL);
	if (chosenModel.ok === false) return fail(chosenModel.message);
	const access = oneOf<AccessMode>(body.access_mode ?? "everyone", "access_mode", ["everyone", "linked"]);
	if (access.ok === false) return fail(access.message);
	const usage = oneOf<UsageDataMode>(body.usage_data_mode ?? "dm", "usage_data_mode", ["off", "dm", "dm_and_channels"]);
	if (usage.ok === false) return fail(usage.message);
	const rawAppId = body.slack_app_id ?? null;
	if (rawAppId !== null && (typeof rawAppId !== "string" || !UUID_PATTERN.test(rawAppId))) return fail("slack_app_id must be the id of the workspace's Slack app");
	const appId = rawAppId === null ? null : String(rawAppId);
	const problem = planProblem({ plan_people: planPeople.value, max_people: max.value, monthly_cap_nanos: usdToNanos(cap.value) });
	if (problem) return fail(problem);
	return ok({
		plan_people: planPeople.value,
		over_plan: overPlan.value,
		max_people: max.value,
		monthly_cap_usd: cap.value,
		token_monthly_limit_usd: keyLimit.value,
		model: chosenModel.value,
		access_mode: access.value,
		usage_data_mode: usage.value,
		slack_app_id: appId === null ? null : appId.toLowerCase(),
	});
}

const PATCH_FIELDS = new Set([
	"workspaceId", "plan_people", "over_plan", "max_people", "monthly_cap_usd", "answers_per_person_hour",
	"model", "instructions", "access_mode", "usage_data_mode", "usage_data_channel_ids",
	"allow_guests", "allow_external_users", "token_monthly_limit_usd", "status",
]);

/** Validates a settings change. Unknown fields are rejected; cross-field rules need the current row (planProblem). */
export function parseSettingsPatch(body: Body): Result<SlackAgentPatch> {
	const unknown = unknownField(body, PATCH_FIELDS);
	if (unknown) return fail(`Unknown field: ${unknown}`);
	const update: SlackAgentRowUpdate = {};
	const patch: SlackAgentPatch = { update, changedFields: [] };
	const take = <T>(field: string, parse: (value: unknown) => Result<T>, apply: (value: T) => void): string | null => {
		if (body[field] === undefined) return null;
		const parsed = parse(body[field]);
		if (parsed.ok === false) return parsed.message;
		apply(parsed.value);
		patch.changedFields.push(field);
		return null;
	};
	const problems = [
		take("plan_people", parsePlanPeople, (value) => { update.plan_people = value; }),
		take("over_plan", (value) => oneOf<OverPlan>(value, "over_plan", ["refuse", "move_up"]), (value) => { update.over_plan = value; }),
		take("max_people", maxPeople, (value) => { update.max_people = value; }),
		take("monthly_cap_usd", (value) => usd(value, "monthly_cap_usd", false), (value) => { update.monthly_cap_nanos = usdToNanos(value); }),
		take("answers_per_person_hour", (value) => integer(value, "answers_per_person_hour", 1, MAX_ANSWERS_PER_PERSON_HOUR), (value) => { update.answers_per_person_hour = value; }),
		take("model", model, (value) => { update.model = value; }),
		take("instructions", instructions, (value) => { update.instructions = value; }),
		take("access_mode", (value) => oneOf<AccessMode>(value, "access_mode", ["everyone", "linked"]), (value) => { update.access_mode = value; }),
		take("usage_data_mode", (value) => oneOf<UsageDataMode>(value, "usage_data_mode", ["off", "dm", "dm_and_channels"]), (value) => { update.usage_data_mode = value; }),
		take("usage_data_channel_ids", channelIds, (value) => { update.usage_data_channel_ids = value; }),
		take("allow_guests", (value) => bool(value, "allow_guests"), (value) => { update.allow_guests = value; }),
		take("allow_external_users", (value) => bool(value, "allow_external_users"), (value) => { update.allow_external_users = value; }),
		take("token_monthly_limit_usd", (value) => usd(value, "token_monthly_limit_usd", true), (value) => { patch.keyMonthlyLimitNanos = usdToNanos(value); }),
		// payment_due and uninstalled are never set here: paying clears payment_due, DELETE uninstalls.
		take("status", (value) => oneOf<SlackAgentStatusChange>(value, "status", ["active", "paused"]), (value) => { patch.status = value; }),
	];
	const problem = problems.find((message) => message !== null);
	if (problem) return fail(problem);
	if (!patch.changedFields.length) return fail("Provide at least one setting to change");
	return ok(patch);
}
