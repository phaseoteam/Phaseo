// Settings → Slack: the web-api shapes, the drafts its forms hold, and how a
// draft becomes a request body. The API speaks dollars; drafts keep the text an
// admin typed, so a blank field can mean "no limit". The limits mirror
// apps/web-api/src/routes/account/slack-agent-settings.ts, so a bad value gets a
// clear message here instead of the API's 400.

import { PLAN_TIERS, NANOS_PER_USD, slackAgentPlanNanos } from "@/lib/slack-agent/pricing";

export type SlackAccessMode = "everyone" | "linked";
export type SlackUsageDataMode = "off" | "dm" | "dm_and_channels";
export type SlackOverPlan = "refuse" | "move_up";
/** Where the agent may search Slack for the person asking: direct messages only by default. */
export type SlackSearchMode = "off" | "dm" | "dm_and_channels";
export const SLACK_SEARCH_MODES: readonly SlackSearchMode[] = ["off", "dm", "dm_and_channels"];
/** The Slack scope searching needs; installations from before it lack it until an admin updates the Slack permissions. */
export const SLACK_SEARCH_SCOPE = "search:read.public";

export type SlackAgentSettings = {
	plan_people: number;
	over_plan: SlackOverPlan;
	max_people: number | null;
	monthly_cap_usd: number;
	answers_per_person_hour: number;
	model: string;
	/** People may start a message with "with <model>:" to have one of allowed_models answer it. */
	model_choice_enabled: boolean;
	allowed_models: string[];
	/** The agent's notes, pins and to-dos. Off: it saves and sees none, saved ones are kept, and skills still work. */
	memory_enabled: boolean;
	/** Where the agent may search Slack as the person asking. Missing from responses of an older web-api: direct messages. */
	search_mode?: SlackSearchMode;
	/** Recurring tasks (slackAgentSchedules.ts): on or off, the most per workspace, and who can set them up. */
	schedules_enabled?: boolean;
	schedules_max?: number;
	schedule_creators?: "everyone" | "linked";
	instructions: string | null;
	access_mode: SlackAccessMode;
	usage_data_mode: SlackUsageDataMode;
	usage_data_channel_ids: string[];
	allow_guests: boolean;
	allow_external_users: boolean;
	token_monthly_limit_usd: number;
};

export type SlackAgentInstallation = {
	id: string;
	team_id: string | null;
	team_name: string | null;
	enterprise_id: string | null;
	bot_user_id: string;
	/** active, paused (by an admin) or payment_due (a past month is unpaid). */
	status: string;
	installed_at: string;
	uses_custom_app: boolean;
	/** The Slack scopes the installation was granted, and those the agent now asks for that it lacks (Update Slack permissions). */
	permissions?: { granted: string[]; missing: string[] };
	settings: SlackAgentSettings;
	plan: { people: number; price_usd: number };
	/** Counted in the database for the current UTC month. Absent in PATCH responses. */
	month?: {
		period_start: string;
		people: number;
		answers: number;
		estimated_charge_usd: number;
		/** Model requests through the agent's managed key, billed from credits, not part of the charge. Null when it couldn't be read. */
		model_spend_usd?: number | null;
		model_requests?: number | null;
	};
};

export type SlackAgentCharge = {
	period_start: string;
	people: number;
	answers: number;
	amount_usd: number;
	/** That month's model spend through the installation's key, separate from amount_usd. Null when it couldn't be read. */
	model_spend_usd?: number | null;
	/** pending (waiting for credits) or charged. */
	status: string;
	charged_at: string | null;
};

export type SlackCustomApp = { id: string; slack_app_id: string; client_id: string; created_at: string; updated_at: string };

export type SlackAgentManagerView = {
	workspaceId: string;
	canManage: true;
	configured: { hosted_app: boolean; custom_app: boolean };
	redirect_url: string;
	scopes: string[];
	/** Whether the agent may use Auto (phaseo/auto): the gateway refuses it without Auto Routing access. */
	auto_routing: boolean;
	installed: boolean;
	installation: SlackAgentInstallation | null;
	custom_app: SlackCustomApp | null;
	charges: SlackAgentCharge[];
};

export type SlackAgentMemberView = {
	workspaceId: string;
	canManage: false;
	installed: boolean;
	installation: { team_name: string | null; status: string; installed_at: string } | null;
};

export type SlackAgentView = SlackAgentManagerView | SlackAgentMemberView;

export const AUTO_SLACK_AGENT_MODEL = "phaseo/auto";
/** The model preselected where Auto isn't available, or once an admin chooses a specific model. */
export const DEFAULT_SLACK_AGENT_MODEL = "openai/gpt-6-luna";
export const DEFAULT_ANSWERS_PER_PERSON_HOUR = 60;
export const MAX_ANSWERS_PER_PERSON_HOUR = 10_000;
export const MAX_MONTHLY_USD = 100_000;
export const MIN_CUSTOM_PLAN_PEOPLE = 101;
export const MAX_PLAN_PEOPLE = 10_000_000;
export const MAX_INSTRUCTIONS_CHARS = 8_000;
export const MAX_USAGE_DATA_CHANNELS = 100;
/** The most models people may choose per message. */
export const MAX_ALLOWED_MODELS = 10;
/** Each answer's limits, whichever model answers (apps/slack/src/agent.ts: TURN_MAX_COST_USD, MAX_STEPS). */
export const TURN_COST_LIMIT_USD = 0.5;
export const TURN_STEP_LIMIT = 12;
/** The plan choice for a workspace bigger than the largest standard plan. */
export const CUSTOM_PLAN = "custom";
export const STANDARD_PLAN_PEOPLE: readonly number[] = PLAN_TIERS.map((tier) => tier.people);

const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
const CHANNEL_PATTERN = /^[CG][A-Z0-9]{2,31}$/;
const SLACK_APP_ID_PATTERN = /^A[A-Z0-9]{2,31}$/;
const SLACK_CLIENT_ID_PATTERN = /^[0-9]{1,30}\.[0-9]{1,30}$/;
const SLACK_APP_SECRET_PATTERN = /^[A-Za-z0-9]{16,128}$/;

/** US-format dollars, always with cents: $12.50. */
export function formatUsd(value: number): string {
	return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Whether a model id is Auto, compared as the gateway does. */
export function isAutoModel(model: string): boolean {
	return model.trim().toLowerCase() === AUTO_SLACK_AGENT_MODEL;
}

/** The plan's monthly price in dollars, from the shared price list. */
export function planPriceUsd(people: number): number {
	return slackAgentPlanNanos(people) / NANOS_PER_USD;
}

/** A dollar amount as an input shows it: 25 -> "25", 12.5 -> "12.50". */
export function amountInput(value: number): string {
	return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** A whole number as typed, allowing 1,000-style grouping. Null if it isn't one. */
export function parseWhole(text: string): number | null {
	const trimmed = text.trim();
	const plain = /^\d{1,3}(?:,\d{3})+$/.test(trimmed) ? trimmed.replaceAll(",", "") : trimmed;
	return /^\d+$/.test(plain) ? Number(plain) : null;
}

/**
 * Dollars as typed, with an optional $ and at most two decimals. A comma is never
 * read as a decimal mark, so "12,50" is rejected rather than taken as 1,250.
 */
export function parseAmount(text: string): number | null {
	const trimmed = text.trim().replace(/^\$\s*/, "");
	const plain = /^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(trimmed) ? trimmed.replaceAll(",", "") : trimmed;
	return /^\d+(?:\.\d{1,2})?$/.test(plain) ? Number(plain) : null;
}

/**
 * Slack channel IDs separated by commas, spaces or new lines; null if any is not one.
 * IDs are not upper-cased: that would turn a channel name such as "general" into
 * the valid-looking "GENERAL".
 */
export function parseChannelIds(text: string): string[] | null {
	const ids = [...new Set(text.split(/[\s,]+/).map((entry) => entry.trim()).filter(Boolean))];
	return ids.every((id) => CHANNEL_PATTERN.test(id)) ? ids : null;
}

/** The limits both forms share, as typed. */
export type SlackLimitsDraft = {
	/** A standard plan's people, as text, or CUSTOM_PLAN. */
	plan: string;
	customPlanPeople: string;
	overPlan: SlackOverPlan;
	/** Blank: no limit. */
	maxPeople: string;
	monthlyCapUsd: string;
	answersPerPersonHour: string;
	allowGuests: boolean;
	allowExternalUsers: boolean;
	/** The agent key's monthly model spend limit. Blank: no limit. */
	tokenLimitUsd: string;
};

export type SlackInstallDraft = SlackLimitsDraft & {
	model: string;
	accessMode: SlackAccessMode;
	/** Install the workspace's own Slack app instead of Phaseo's. */
	useCustomApp: boolean;
};

export type SlackSettingsDraft = SlackLimitsDraft & {
	model: string;
	modelChoiceEnabled: boolean;
	/** Model ids, in the order the admin added them; Auto is phaseo/auto. */
	allowedModels: string[];
	instructions: string;
	accessMode: SlackAccessMode;
	usageDataMode: SlackUsageDataMode;
	channelIds: string;
};

export type SlackDraftField =
	| "customPlanPeople" | "maxPeople" | "monthlyCapUsd" | "answersPerPersonHour" | "tokenLimitUsd"
	| "model" | "allowedModels" | "instructions" | "channelIds";

/** A form problem; its code is a SettingsUI.slack.problems key. */
export type SlackDraftProblem = {
	field: SlackDraftField;
	code: "planPeople" | "maxPeople" | "maxPeopleBelowPlan" | "monthlyCap" | "capBelowPlan" | "answersPerHour" | "tokenLimit"
		| "model" | "allowedModelsEmpty" | "tooManyModels" | "instructions" | "channelIds" | "tooManyChannels";
	values?: Record<string, string | number>;
};

type Built<T> = { ok: true; value: T } | { ok: false; problem: SlackDraftProblem };

/** Auto where the workspace may use it, otherwise a model every workspace can use. */
export function installDraftDefaults(useCustomApp = false, autoRouting = false): SlackInstallDraft {
	return {
		plan: "10",
		customPlanPeople: "",
		overPlan: "refuse",
		maxPeople: "",
		monthlyCapUsd: "10",
		answersPerPersonHour: String(DEFAULT_ANSWERS_PER_PERSON_HOUR),
		allowGuests: true,
		allowExternalUsers: false,
		tokenLimitUsd: "",
		model: autoRouting ? AUTO_SLACK_AGENT_MODEL : DEFAULT_SLACK_AGENT_MODEL,
		accessMode: "everyone",
		useCustomApp,
	};
}

export function settingsDraftFrom(settings: SlackAgentSettings): SlackSettingsDraft {
	const standard = STANDARD_PLAN_PEOPLE.includes(settings.plan_people);
	return {
		plan: standard ? String(settings.plan_people) : CUSTOM_PLAN,
		customPlanPeople: standard ? "" : String(settings.plan_people),
		overPlan: settings.over_plan,
		maxPeople: settings.max_people == null ? "" : String(settings.max_people),
		monthlyCapUsd: amountInput(settings.monthly_cap_usd),
		answersPerPersonHour: String(settings.answers_per_person_hour),
		allowGuests: settings.allow_guests,
		allowExternalUsers: settings.allow_external_users,
		tokenLimitUsd: settings.token_monthly_limit_usd > 0 ? amountInput(settings.token_monthly_limit_usd) : "",
		model: settings.model,
		modelChoiceEnabled: settings.model_choice_enabled,
		allowedModels: settings.allowed_models,
		instructions: settings.instructions ?? "",
		accessMode: settings.access_mode,
		usageDataMode: settings.usage_data_mode,
		channelIds: settings.usage_data_channel_ids.join(", "),
	};
}

type Limits = {
	plan_people: number;
	over_plan: SlackOverPlan;
	max_people: number | null;
	monthly_cap_usd: number;
	answers_per_person_hour: number;
	allow_guests: boolean;
	allow_external_users: boolean;
	token_monthly_limit_usd: number;
};

/** Validates the limits together, as the API does: the hard limit and the cap must cover the plan. */
export function buildLimits(draft: SlackLimitsDraft): Built<Limits> {
	const fail = (problem: SlackDraftProblem): Built<Limits> => ({ ok: false, problem });
	let planPeople: number;
	if (draft.plan === CUSTOM_PLAN) {
		const people = parseWhole(draft.customPlanPeople);
		if (people == null || people < MIN_CUSTOM_PLAN_PEOPLE || people > MAX_PLAN_PEOPLE) {
			return fail({ field: "customPlanPeople", code: "planPeople", values: { min: MIN_CUSTOM_PLAN_PEOPLE.toLocaleString("en-US"), max: MAX_PLAN_PEOPLE.toLocaleString("en-US") } });
		}
		planPeople = people;
	} else {
		planPeople = Number(draft.plan);
		if (!STANDARD_PLAN_PEOPLE.includes(planPeople)) return fail({ field: "customPlanPeople", code: "planPeople", values: { min: MIN_CUSTOM_PLAN_PEOPLE.toLocaleString("en-US"), max: MAX_PLAN_PEOPLE.toLocaleString("en-US") } });
	}
	let maxPeople: number | null = null;
	if (draft.maxPeople.trim()) {
		maxPeople = parseWhole(draft.maxPeople);
		if (maxPeople == null || maxPeople < 1 || maxPeople > MAX_PLAN_PEOPLE) return fail({ field: "maxPeople", code: "maxPeople" });
		if (maxPeople < planPeople) return fail({ field: "maxPeople", code: "maxPeopleBelowPlan", values: { people: planPeople.toLocaleString("en-US") } });
	}
	const cap = parseAmount(draft.monthlyCapUsd);
	if (cap == null || cap <= 0 || cap > MAX_MONTHLY_USD) return fail({ field: "monthlyCapUsd", code: "monthlyCap", values: { max: formatUsd(MAX_MONTHLY_USD) } });
	const planPrice = planPriceUsd(planPeople);
	if (cap < planPrice) return fail({ field: "monthlyCapUsd", code: "capBelowPlan", values: { price: formatUsd(planPrice) } });
	const hourly = parseWhole(draft.answersPerPersonHour);
	if (hourly == null || hourly < 1 || hourly > MAX_ANSWERS_PER_PERSON_HOUR) {
		return fail({ field: "answersPerPersonHour", code: "answersPerHour", values: { max: MAX_ANSWERS_PER_PERSON_HOUR.toLocaleString("en-US") } });
	}
	let tokenLimit = 0;
	if (draft.tokenLimitUsd.trim()) {
		const parsed = parseAmount(draft.tokenLimitUsd);
		if (parsed == null || parsed > MAX_MONTHLY_USD) return fail({ field: "tokenLimitUsd", code: "tokenLimit", values: { max: formatUsd(MAX_MONTHLY_USD) } });
		tokenLimit = parsed;
	}
	return {
		ok: true,
		value: {
			plan_people: planPeople,
			over_plan: draft.overPlan,
			max_people: maxPeople,
			monthly_cap_usd: cap,
			answers_per_person_hour: hourly,
			allow_guests: draft.allowGuests,
			allow_external_users: draft.allowExternalUsers,
			token_monthly_limit_usd: tokenLimit,
		},
	};
}

function buildModel(model: string): Built<string> {
	const trimmed = model.trim();
	return MODEL_PATTERN.test(trimmed) ? { ok: true, value: trimmed } : { ok: false, problem: { field: "model", code: "model" } };
}

/** The POST /slack/install body (without workspaceId). */
export function installPayload(draft: SlackInstallDraft, customAppId: string | null): Built<Record<string, unknown>> {
	const model = buildModel(draft.model);
	if (!model.ok) return model;
	const limits = buildLimits(draft);
	if (!limits.ok) return limits;
	return {
		ok: true,
		value: {
			...limits.value,
			model: model.value,
			access_mode: draft.accessMode,
			slack_app_id: draft.useCustomApp ? customAppId : null,
		},
	};
}

/**
 * The PATCH /slack body: only the fields that differ from the saved draft, so
 * the audit log names what changed. Every field is still validated, because the
 * API checks the plan, the hard limit and the cap together.
 */
export function settingsPatch(draft: SlackSettingsDraft, saved: SlackSettingsDraft): Built<Record<string, unknown>> {
	const model = buildModel(draft.model);
	if (!model.ok) return model;
	if (draft.modelChoiceEnabled && !draft.allowedModels.length) return { ok: false, problem: { field: "allowedModels", code: "allowedModelsEmpty" } };
	if (draft.allowedModels.length > MAX_ALLOWED_MODELS) return { ok: false, problem: { field: "allowedModels", code: "tooManyModels", values: { max: MAX_ALLOWED_MODELS } } };
	const instructions = draft.instructions.trim();
	if ([...instructions].length > MAX_INSTRUCTIONS_CHARS) {
		return { ok: false, problem: { field: "instructions", code: "instructions", values: { max: MAX_INSTRUCTIONS_CHARS.toLocaleString("en-US") } } };
	}
	const channels = parseChannelIds(draft.channelIds);
	if (!channels) return { ok: false, problem: { field: "channelIds", code: "channelIds" } };
	if (channels.length > MAX_USAGE_DATA_CHANNELS) {
		return { ok: false, problem: { field: "channelIds", code: "tooManyChannels", values: { max: MAX_USAGE_DATA_CHANNELS } } };
	}
	const limits = buildLimits(draft);
	if (!limits.ok) return limits;
	const patch: Record<string, unknown> = {};
	const changed = (field: keyof SlackSettingsDraft) => draft[field] !== saved[field];
	const changedText = (field: "maxPeople" | "monthlyCapUsd" | "answersPerPersonHour" | "tokenLimitUsd" | "customPlanPeople") => draft[field].trim() !== saved[field].trim();
	if (changed("plan") || (draft.plan === CUSTOM_PLAN && changedText("customPlanPeople"))) patch.plan_people = limits.value.plan_people;
	if (changed("overPlan")) patch.over_plan = limits.value.over_plan;
	if (changedText("maxPeople")) patch.max_people = limits.value.max_people;
	if (changedText("monthlyCapUsd")) patch.monthly_cap_usd = limits.value.monthly_cap_usd;
	if (changedText("answersPerPersonHour")) patch.answers_per_person_hour = limits.value.answers_per_person_hour;
	if (changed("allowGuests")) patch.allow_guests = limits.value.allow_guests;
	if (changed("allowExternalUsers")) patch.allow_external_users = limits.value.allow_external_users;
	if (changedText("tokenLimitUsd")) patch.token_monthly_limit_usd = limits.value.token_monthly_limit_usd;
	if (model.value !== saved.model.trim()) patch.model = model.value;
	if (changed("modelChoiceEnabled")) patch.model_choice_enabled = draft.modelChoiceEnabled;
	if (draft.allowedModels.join(",") !== saved.allowedModels.join(",")) patch.allowed_models = draft.allowedModels;
	if (instructions !== saved.instructions.trim()) patch.instructions = instructions || null;
	if (changed("accessMode")) patch.access_mode = draft.accessMode;
	if (changed("usageDataMode")) patch.usage_data_mode = draft.usageDataMode;
	if (channels.join(",") !== (parseChannelIds(saved.channelIds) ?? []).join(",")) patch.usage_data_channel_ids = channels;
	return { ok: true, value: patch };
}

export type SlackCustomAppDraft = { slackAppId: string; clientId: string; clientSecret: string; signingSecret: string };

export type SlackCustomAppProblem = { field: keyof SlackCustomAppDraft };

/** The PUT /slack/custom-app body (without workspaceId). */
export function customAppPayload(draft: SlackCustomAppDraft): { ok: true; value: Record<string, string> } | { ok: false; problem: SlackCustomAppProblem } {
	const value = {
		slack_app_id: draft.slackAppId.trim().toUpperCase(),
		client_id: draft.clientId.trim(),
		client_secret: draft.clientSecret.trim(),
		signing_secret: draft.signingSecret.trim(),
	};
	if (!SLACK_APP_ID_PATTERN.test(value.slack_app_id)) return { ok: false, problem: { field: "slackAppId" } };
	if (!SLACK_CLIENT_ID_PATTERN.test(value.client_id)) return { ok: false, problem: { field: "clientId" } };
	if (!SLACK_APP_SECRET_PATTERN.test(value.client_secret)) return { ok: false, problem: { field: "clientSecret" } };
	if (!SLACK_APP_SECRET_PATTERN.test(value.signing_secret)) return { ok: false, problem: { field: "signingSecret" } };
	return { ok: true, value };
}

/** SettingsUI.slack.errors keys. */
export type SlackErrorKey =
	| "notAvailable" | "forbidden" | "privacyReview" | "paymentDue" | "appConflict" | "appTaken" | "appInUse" | "appNotFound"
	| "appMissing" | "appUnavailable" | "alreadyInstalled" | "teamInUse" | "notInstalled" | "conflict" | "keyMissing"
	| "slackDenied" | "slackError" | "slackResponseInvalid" | "stateExpired" | "stateInvalid" | "signInRequired"
	| "sessionMismatch" | "installFailed" | "autoUnavailable" | "unknownModels" | "modelChoiceNeedsModels" | "tooManyModels"
	| "teamMismatch" | "invalid" | "unavailable" | "generic";

// Every error code the Slack settings routes return, including the OAuth
// callback's ?error= values.
const ERROR_KEYS: Record<string, SlackErrorKey> = {
	slack_not_configured: "notAvailable",
	forbidden: "forbidden",
	chat_privacy_review_required: "privacyReview",
	payment_due: "paymentDue",
	slack_app_conflict: "appConflict",
	slack_app_taken: "appTaken",
	slack_app_in_use: "appInUse",
	slack_app_not_found: "appNotFound",
	not_found: "appMissing",
	slack_app_unavailable: "appUnavailable",
	already_installed: "alreadyInstalled",
	slack_team_in_use: "teamInUse",
	slack_team_mismatch: "teamMismatch",
	not_installed: "notInstalled",
	conflict: "conflict",
	key_missing: "keyMissing",
	slack_denied: "slackDenied",
	slack_error: "slackError",
	slack_exchange_failed: "slackError",
	slack_code_missing: "slackError",
	slack_response_invalid: "slackResponseInvalid",
	state_expired: "stateExpired",
	state_invalid: "stateInvalid",
	sign_in_required: "signInRequired",
	unauthorized: "signInRequired",
	session_mismatch: "sessionMismatch",
	install_failed: "installFailed",
	auto_routing_unavailable: "autoUnavailable",
	unknown_models: "unknownModels",
	model_choice_needs_models: "modelChoiceNeedsModels",
	too_many_models: "tooManyModels",
	bad_request: "invalid",
	settings_unavailable: "unavailable",
	settings_write_failed: "unavailable",
	key_write_failed: "unavailable",
};

export function slackErrorKey(code: string | null | undefined, status: number | null | undefined = null): SlackErrorKey {
	if (code && Object.hasOwn(ERROR_KEYS, code)) return ERROR_KEYS[code];
	if (status === 400) return "invalid";
	if (status === 401) return "signInRequired";
	if (status === 403) return "forbidden";
	if (status === 409) return "conflict";
	if (status != null && status >= 500) return "unavailable";
	return "generic";
}

/**
 * What the OAuth callback's redirect says: ?installed=1, ?permissions_updated=1
 * (or partial, when Slack granted only some of the scopes), or ?error=<code>.
 */
export function callbackNotice(params: Pick<URLSearchParams, "get">): { kind: "installed" } | { kind: "permissionsUpdated"; partial: boolean } | { kind: "error"; key: SlackErrorKey } | null {
	if (params.get("installed") === "1") return { kind: "installed" };
	const updated = params.get("permissions_updated");
	if (updated === "1" || updated === "partial") return { kind: "permissionsUpdated", partial: updated === "partial" };
	const error = params.get("error");
	return error ? { kind: "error", key: slackErrorKey(error) } : null;
}

/** SettingsUI.slack.link.errors keys, for POST /slack/link. */
export type SlackLinkErrorKey = "expired" | "invalid" | "notInstalled" | "wrongWorkspace" | "notAvailable" | "signIn" | "failed";

const LINK_ERROR_KEYS: Record<string, SlackLinkErrorKey> = {
	unauthorized: "signIn",
	link_expired: "expired",
	link_invalid: "invalid",
	bad_request: "invalid",
	not_installed: "notInstalled",
	forbidden: "wrongWorkspace",
	slack_not_configured: "notAvailable",
};

export function slackLinkErrorKey(code: string | null | undefined): SlackLinkErrorKey {
	return code && Object.hasOwn(LINK_ERROR_KEYS, code) ? LINK_ERROR_KEYS[code] : "failed";
}

/** Link tokens are a signed payload and signature in base64url. */
export const SLACK_LINK_TOKEN_PATTERN = /^[A-Za-z0-9_-]{1,2048}\.[A-Za-z0-9_-]{1,512}$/;

/** "October 2026" for a period_start of 2026-10-01, in UTC so it never shifts a month. */
export function chargeMonth(periodStart: string, locale: string): string {
	const date = new Date(`${periodStart.slice(0, 10)}T00:00:00Z`);
	if (Number.isNaN(date.getTime())) return periodStart;
	return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
