import { parseWhole, slackErrorKey, type SlackErrorKey } from "./slackAgentForm";

// The Slack agent's recurring tasks, as Settings → Slack shows them: the admins'
// settings (on or off, the most per workspace, who can set them up) and the
// workspace's schedules. Limits match the database's.

export type SlackScheduleFrequency = "hourly" | "daily" | "weekdays" | "weekly" | "monthly";
export type SlackScheduleCreators = "everyone" | "linked";
export type SlackScheduleResult = "answered" | "failed" | "skipped";

export const MAX_SCHEDULES = 100;
export const DEFAULT_SCHEDULES_MAX = 20;
/** A run that hasn't reported back after this long is shown as having no result rather than running. */
const RUNNING_FOR_MS = 30 * 60_000;

export type SlackAgentSchedule = {
	id: string;
	channel_id: string;
	title: string;
	prompt: string;
	frequency: SlackScheduleFrequency;
	/** Null for hourly. */
	hour: number | null;
	minute: number;
	/** 1 (Monday) to 7, for weekly. */
	day_of_week: number | null;
	day_of_month: number | null;
	/** The creator's IANA time zone from Slack; the times are local there. */
	timezone: string;
	created_by: string;
	status: "active" | "paused";
	pause_reason: string | null;
	next_run_at: string;
	last_run_at: string | null;
	last_result: SlackScheduleResult | null;
	last_result_reason: string | null;
	failures: number;
	created_at: string;
};

export type SlackAgentSchedules = {
	schedules: SlackAgentSchedule[];
	total: number;
	limit: number;
	enabled: boolean;
	creators: SlackScheduleCreators;
};

export type SlackScheduleSettings = { schedules_enabled?: boolean; schedules_max?: number; schedule_creators?: SlackScheduleCreators };
export type SlackScheduleSettingsDraft = { enabled: boolean; max: string; creators: SlackScheduleCreators };

/** The settings as the form edits them; the column defaults where web-api didn't send one. */
export function scheduleSettingsDraft(settings: SlackScheduleSettings): SlackScheduleSettingsDraft {
	return {
		enabled: settings.schedules_enabled !== false,
		max: String(settings.schedules_max ?? DEFAULT_SCHEDULES_MAX),
		creators: settings.schedule_creators === "linked" ? "linked" : "everyone",
	};
}

/** The settings that changed, as web-api's PATCH takes them. */
export function scheduleSettingsPatch(draft: SlackScheduleSettingsDraft, saved: SlackScheduleSettingsDraft): { ok: true; value: Record<string, unknown> } | { ok: false; problem: "max" } {
	const max = parseWhole(draft.max);
	if (max === null || max < 1 || max > MAX_SCHEDULES) return { ok: false, problem: "max" };
	const value: Record<string, unknown> = {};
	if (draft.enabled !== saved.enabled) value.schedules_enabled = draft.enabled;
	if (String(max) !== saved.max) value.schedules_max = max;
	if (draft.creators !== saved.creators) value.schedule_creators = draft.creators;
	return { ok: true, value };
}

/** Where a schedule posts: a channel, or a direct message with the agent. */
export function scheduleWhere(channelId: string): "channel" | "directMessage" {
	return channelId.startsWith("D") ? "directMessage" : "channel";
}

/** SettingsUI.slack.schedules.pauseReasons keys, by the database's pause reasons. */
const PAUSE_REASON_KEYS = {
	admin: "admin",
	creator_access: "creatorAccess",
	not_in_channel: "notInChannel",
	installation_paused: "installationPaused",
	payment_due: "paymentDue",
	failures: "failures",
} as const;

export type SlackSchedulePauseKey = (typeof PAUSE_REASON_KEYS)[keyof typeof PAUSE_REASON_KEYS];

export function pauseReasonKey(reason: string | null): SlackSchedulePauseKey {
	return reason && Object.hasOwn(PAUSE_REASON_KEYS, reason) ? PAUSE_REASON_KEYS[reason as keyof typeof PAUSE_REASON_KEYS] : "admin";
}

/** SettingsUI.slack.schedules.skipReasons keys, by why a run was skipped; other skipped runs show as Skipped. */
const SKIP_REASON_KEYS = {
	installation_paused: "installationPaused",
	payment_due: "paymentDue",
	schedules_off: "schedulesOff",
	max_people: "limit",
	plan_full: "limit",
	hourly_limit: "limit",
	monthly_cap: "limit",
} as const;

export type SlackScheduleSkipKey = (typeof SKIP_REASON_KEYS)[keyof typeof SKIP_REASON_KEYS];

export function skipReasonKey(reason: string | null): SlackScheduleSkipKey | null {
	return reason && Object.hasOwn(SKIP_REASON_KEYS, reason) ? SKIP_REASON_KEYS[reason as keyof typeof SKIP_REASON_KEYS] : null;
}

/** What the last run did: its result, still running (claimed in the last half hour without a result), or none yet. */
export function lastRunState(schedule: Pick<SlackAgentSchedule, "last_result" | "last_run_at">, now = Date.now()): SlackScheduleResult | "running" | "none" {
	if (schedule.last_result) return schedule.last_result;
	if (schedule.last_run_at && now - Date.parse(schedule.last_run_at) < RUNNING_FOR_MS) return "running";
	return "none";
}

/** SettingsUI.slack.schedules.errors keys, for the schedule routes' own codes. */
export type SlackScheduleErrorKey = "scheduleNotFound";

export type SlackScheduleError =
	| { scope: "schedules"; key: SlackScheduleErrorKey }
	| { scope: "slack"; key: SlackErrorKey; message?: string | null };

export function slackScheduleError(code: string | null | undefined, status: number | null | undefined, message?: string | null): SlackScheduleError {
	if (code === "schedule_not_found") return { scope: "schedules", key: "scheduleNotFound" };
	return { scope: "slack", key: slackErrorKey(code, status), message };
}
