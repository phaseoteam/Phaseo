import type { AgentTool } from "@phaseo/agent-sdk";
import type { Installation } from "./installations";
import { usersInfo, type SlackClient } from "./slack-api";
import { savingRefusal, type SearchedThisAnswer } from "./slack-search";
import type { Db } from "./supabase";
import type { TurnRef } from "./turns";
import { ToolInputError } from "./usage-tools";

// Recurring tasks (schedules): someone asks the agent to do something
// regularly, and it saves a self-contained prompt for this conversation, run
// hourly, daily, on weekdays, weekly or monthly at a local time in their Slack
// time zone (users.info tz). Each run posts a short "Scheduled:" message here
// and answers in its thread as an answer to them (scheduled-runs.ts).
//
// Everything goes through database functions with the service role: saving
// holds the admins' switch, who may set them up and the most per workspace;
// cancelling allows the person who set it up and anyone linked to a workspace
// owner or admin. Someone from another organisation (Slack Connect) can list
// the conversation's but not set one up, and a scheduled run itself gets none
// of these tools. An answer that has searched Slack sets none up, as its title
// and prompt could carry what the search found (searchedThisAnswer,
// slack-search.ts). Admins see, pause, resume and delete them in Settings → Slack.

export const MAX_SCHEDULE_TITLE_CHARS = 80;
export const MAX_SCHEDULE_PROMPT_CHARS = 2_000;
export const SCHEDULE_TOOL_IDS = ["schedule_task", "list_schedules", "cancel_schedule"] as const;
export const SCHEDULE_FREQUENCIES = ["hourly", "daily", "weekdays", "weekly", "monthly"] as const;
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;
/** IANA names, as the schedules table accepts them. */
const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+){0,2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_COLUMNS = "id,channel_id,title,prompt,frequency,hour,minute,day_of_week,day_of_month,timezone,created_by,status,pause_reason,next_run_at,last_result,last_result_reason";

export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

/** When a schedule runs: hour is null for hourly; day_of_week is 1 (Monday) to 7, for weekly; day_of_month for monthly. */
export type ScheduleTiming = {
	frequency: ScheduleFrequency;
	hour: number | null;
	minute: number;
	day_of_week: number | null;
	day_of_month: number | null;
	timezone: string;
};

export type ScheduleRow = ScheduleTiming & {
	id: string;
	channel_id: string;
	title: string;
	prompt: string;
	created_by: string;
	status: "active" | "paused";
	pause_reason: string | null;
	next_run_at: string;
	last_result: "answered" | "failed" | "skipped" | null;
	/** Why the last run was skipped or failed, e.g. installation_paused. */
	last_result_reason: string | null;
};

/** Text for Slack's mrkdwn, which reads &, < and > as markup. */
export function slackText(text: string): string {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function pad(value: number | null): string {
	return String(value ?? 0).padStart(2, "0");
}

function ordinal(day: number): string {
	const tens = day % 100;
	const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][day % 10] ?? "th";
	return `${day}${suffix}`;
}

/** How often a schedule runs, in words, e.g. "every weekday at 09:00 (Europe/London time)". */
export function describeTiming(timing: ScheduleTiming): string {
	const at = `${pad(timing.hour)}:${pad(timing.minute)}`;
	const zone = ` (${timing.timezone} time)`;
	switch (timing.frequency) {
		case "hourly":
			return `every hour at ${pad(timing.minute)} minutes past${zone}`;
		case "daily":
			return `every day at ${at}${zone}`;
		case "weekdays":
			return `every weekday, Monday to Friday, at ${at}${zone}`;
		case "weekly":
			return `every ${DAY_NAMES[(timing.day_of_week ?? 1) - 1] ?? "week"} at ${at}${zone}`;
		case "monthly": {
			const day = timing.day_of_month ?? 1;
			return `on the ${ordinal(day)} of every month${day > 28 ? " (or its last day)" : ""} at ${at}${zone}`;
		}
	}
}

/** A run time in the schedule's own time zone, e.g. "Mon, Nov 2, 2026, 09:00 (Europe/London)". */
export function formatRunTime(iso: string, timezone: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	try {
		const text = new Intl.DateTimeFormat("en-US", {
			timeZone: timezone, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
		}).format(date);
		return `${text} (${timezone})`;
	} catch {
		return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
	}
}

export function isTimeZone(value: unknown): value is string {
	if (typeof value !== "string" || value.length > 64 || !TIME_ZONE_PATTERN.test(value)) return false;
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/**
 * What the turn may do with recurring tasks. run: it is a scheduled run, so it
 * gets no schedule tools. off: admins have turned them off. external: someone
 * from another organisation, who can't set one up. create: everything.
 */
export type ScheduleMode = "create" | "off" | "external" | "run";

export function scheduleMode(installation: Pick<Installation, "schedules_enabled">, turn: Pick<TurnRef, "schedule" | "external">): ScheduleMode {
	if (turn.schedule) return "run";
	if (!installation.schedules_enabled) return "off";
	return turn.external ? "external" : "create";
}

const SCHEDULES_HOW = "When someone asks for something to happen regularly, call schedule_task: it saves a self-contained prompt that runs on its own later (hourly at the most), posting a short \"Scheduled:\" message in this conversation and answering it in its thread as an answer to them. Write the prompt so it works without this conversation. Times are the person's local time. Once it's saved, confirm what it does, where it posts, how often it runs and its next run, as schedule_task returns them.";
const SCHEDULES_MANAGE = "list_schedules shows the recurring tasks in this conversation and the person's own; cancel_schedule cancels one when they ask (their own, or anyone's for a Phaseo workspace owner or admin).";

/** What the agent is told about recurring tasks. */
export function scheduleInstructions(mode: ScheduleMode): string[] {
	switch (mode) {
		case "create":
			return [`${SCHEDULES_HOW} ${SCHEDULES_MANAGE}`];
		case "off":
			return [`This workspace's admins have turned recurring tasks off, so you can't set one up; if someone asks, say an admin can turn them on in Phaseo settings. ${SCHEDULES_MANAGE}`];
		case "external":
			return [`The person asking is from another organisation, so they can't set up recurring tasks here; if they ask, say someone in this workspace can. ${SCHEDULES_MANAGE}`];
		case "run":
			return ["This is a scheduled run of a recurring task. Nobody is waiting in the thread to answer questions, so do the task with what you have and give the answer. You can't set up or change recurring tasks during a scheduled run."];
	}
}

export type ScheduleToolContext = {
	db: Db;
	slack: SlackClient;
	installationId: string;
	/** The conversation (channel or DM) the turn answers in, where a schedule it saves posts. */
	channel: string;
	slackUserId: string;
	/** schedule_task is offered: recurring tasks are on and the person isn't from another organisation. */
	canCreate: boolean;
	/**
	 * Keys this run of the turn: its Slack event and the run after question n (eventId:n). schedule_task adds
	 * a digest of what it sets up (scheduleCreationKey), so a retried run (new model tool call ids, calls in
	 * another order) gets the schedule its first attempt saved instead of a second one.
	 */
	runKey: string;
	/** Short notes of what each tool did, kept as the thread's working memory. */
	notes: string[];
	/** Whether the answer has searched Slack: then schedule_task saves nothing, as Slack's terms forbid keeping what search finds (slack-search.ts). */
	searched: SearchedThisAnswer;
};

function text(value: unknown, field: string, max: number): string {
	if (typeof value !== "string" || !value.trim()) throw new ToolInputError(`${field} is required`);
	const trimmed = value.trim();
	// Counted as the database counts characters (code points).
	if ([...trimmed].length > max) throw new ToolInputError(`${field} must be at most ${max.toLocaleString("en-US")} characters`);
	return trimmed;
}

function oneLine(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function frequency(value: unknown): ScheduleFrequency {
	if (typeof value === "string" && (SCHEDULE_FREQUENCIES as readonly string[]).includes(value)) return value as ScheduleFrequency;
	throw new ToolInputError(`frequency must be one of ${SCHEDULE_FREQUENCIES.join(", ")}`);
}

/** The schedule's local timing from the tool's input. */
export function timingInput(input: Record<string, unknown>): Omit<ScheduleTiming, "timezone"> {
	const often = frequency(input.frequency);
	const time = typeof input.time === "string" ? TIME_PATTERN.exec(input.time.trim()) : null;
	if (!time) throw new ToolInputError("time must be a 24-hour local time like 09:00");
	let dayOfWeek: number | null = null;
	let dayOfMonth: number | null = null;
	if (often === "weekly") {
		const index = typeof input.day_of_week === "string" ? (DAYS as readonly string[]).indexOf(input.day_of_week.toLowerCase()) : -1;
		if (index < 0) throw new ToolInputError(`day_of_week is required for weekly: one of ${DAYS.join(", ")}`);
		dayOfWeek = index + 1;
	}
	if (often === "monthly") {
		const day = Number(input.day_of_month);
		if (input.day_of_month === undefined || input.day_of_month === null || !Number.isInteger(day) || day < 1 || day > 31) {
			throw new ToolInputError("day_of_month is required for monthly: a whole number from 1 to 31");
		}
		dayOfMonth = day;
	}
	return { frequency: often, hour: often === "hourly" ? null : Number(time[1]), minute: Number(time[2]), day_of_week: dayOfWeek, day_of_month: dayOfMonth };
}

/** The person's time zone from Slack; UTC when Slack doesn't give one the database knows. */
async function personTimeZone(slack: SlackClient, slackUserId: string): Promise<{ timezone: string; fallback: boolean }> {
	const user = await usersInfo(slack, slackUserId);
	const tz = user.ok ? user.data.tz : undefined;
	return isTimeZone(tz) ? { timezone: tz, fallback: false } : { timezone: "UTC", fallback: true };
}

function where(row: Pick<ScheduleRow, "channel_id">, channel: string): string {
	if (row.channel_id === channel) return "this conversation";
	return row.channel_id.startsWith("D") ? "a direct message with the agent" : `<#${row.channel_id}>`;
}

/** Why a schedule is paused, in words. */
export function pauseReasonText(reason: string | null): string {
	switch (reason) {
		case "admin":
			return "paused by an admin";
		case "creator_access":
			return "paused because the person who set it up can no longer use the agent";
		case "not_in_channel":
			return "paused because the agent can't post in its conversation";
		case "installation_paused":
			return "paused because the agent was paused in this workspace";
		case "payment_due":
			return "paused because a Phaseo bill was unpaid";
		case "failures":
			return "paused after 3 runs in a row didn't go through";
		default:
			return "paused";
	}
}

/** What a schedule's last run did, in words, e.g. "skipped: the agent was paused". */
export function lastRunText(result: NonNullable<ScheduleRow["last_result"]>, reason: string | null): string {
	if (result !== "skipped") return result;
	switch (reason) {
		case "installation_paused":
			return "skipped: the agent was paused";
		case "payment_due":
			return "skipped: a Phaseo bill was unpaid";
		case "schedules_off":
			return "skipped: recurring tasks were turned off";
		case "max_people":
		case "plan_full":
		case "hourly_limit":
		case "monthly_cap":
			return "skipped: a usage limit was reached";
		default:
			return "skipped";
	}
}

function scheduleView(row: ScheduleRow, channel: string) {
	return {
		id: row.id,
		title: row.title,
		prompt: row.prompt,
		runs: describeTiming(row),
		where: where(row, channel),
		status: row.status === "active" ? "active" : pauseReasonText(row.pause_reason),
		...(row.status === "active" ? { next_run: formatRunTime(row.next_run_at, row.timezone) } : {}),
		...(row.last_result ? { last_run: lastRunText(row.last_result, row.last_result_reason) } : {}),
		set_up_by: `<@${row.created_by}>`,
	};
}

/**
 * What a schedule_task save is keyed by: the run (its Slack event and the answer's part) and what it sets up
 * (its conversation, title and timing). A retried run step re-runs the model, so its calls can come in a
 * different order or leave one out; the same task gets the same key (and the schedule saved the first time),
 * another task its own. A retry that renames a task saves it again, which is visible and can be cancelled.
 */
export async function scheduleCreationKey(runKey: string, channel: string, title: string, timing: Omit<ScheduleTiming, "timezone">): Promise<string> {
	const what = JSON.stringify([channel, title.trim().toLowerCase(), timing.frequency, timing.hour, timing.minute, timing.day_of_week, timing.day_of_month]);
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(what)));
	return `${runKey}:${[...digest.subarray(0, 12)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** The recurring task tools: schedule_task when the turn may set one up, then list_schedules and cancel_schedule. */
export function scheduleTools(context: ScheduleToolContext): AgentTool<any, any>[] {
	const { db, slack, installationId, channel, slackUserId, notes } = context;
	const tools: AgentTool<any, any>[] = [
		{
			id: "list_schedules",
			description: "List the recurring tasks that post in this conversation (in a direct message with you, also the ones the person asking set up anywhere): what each does, where it posts, how often, its next run, its status, who set it up, and the id cancel_schedule needs.",
			parameters: { type: "object", properties: {}, additionalProperties: false },
			onError: "return-to-model",
			execute: async () => {
				// Only a direct message is private to the person asking: elsewhere, their tasks in other
				// conversations (private channels, other DMs) and their prompts would be shown to everyone here.
				const conversation: Record<string, string> = channel.startsWith("D")
					? { or: `(channel_id.eq.${channel},created_by.eq.${slackUserId})` }
					: { channel_id: `eq.${channel}` };
				const rows = await db.select<ScheduleRow>("slack_agent_schedules", {
					select: LIST_COLUMNS,
					installation_id: `eq.${installationId}`,
					...conversation,
					order: "created_at.asc",
					limit: "100",
				});
				notes.push("list_schedules");
				return { schedules: rows.map((row) => scheduleView(row, channel)) };
			},
		},
		{
			id: "cancel_schedule",
			description: "Cancel (delete) a recurring task, by its id from list_schedules or schedule_task, when someone asks you to. People can cancel their own; Phaseo workspace owners and admins who connected their account can cancel anyone's.",
			parameters: {
				type: "object",
				properties: { id: { type: "string", description: "The recurring task's id." } },
				required: ["id"],
				additionalProperties: false,
			},
			onError: "return-to-model",
			execute: async (input: Record<string, unknown>) => {
				if (typeof input.id !== "string" || !UUID_PATTERN.test(input.id)) throw new ToolInputError("id must be a recurring task's id from list_schedules or schedule_task");
				const result = await db.rpc<string>("cancel_slack_agent_schedule", { p_installation_id: installationId, p_schedule_id: input.id.toLowerCase(), p_slack_user_id: slackUserId });
				notes.push("cancel_schedule");
				if (result === "deleted") return { cancelled: true };
				if (result === "not_allowed") return { cancelled: false, note: "Only the person who set it up, or a Phaseo workspace owner or admin who connected their Phaseo account, can cancel it." };
				return { cancelled: false, note: "There's no recurring task with that id in this Slack workspace." };
			},
		},
	];
	if (!context.canCreate) return tools;
	return [{
		id: "schedule_task",
		description: `Set up a recurring task in this conversation, only when someone asks for something to happen regularly. Each run gets the prompt on its own, without this conversation, posts a short "Scheduled:" message here and answers it in its thread as an answer to the person asking. Hourly at the most; times are their local time in Slack.`,
		parameters: {
			type: "object",
			properties: {
				title: { type: "string", description: `A short name shown on each run, at most ${MAX_SCHEDULE_TITLE_CHARS} characters, e.g. Weekly spend summary.` },
				prompt: { type: "string", description: `What to do at each run, as a self-contained request with everything it needs, since the run won't see this conversation. At most ${MAX_SCHEDULE_PROMPT_CHARS.toLocaleString("en-US")} characters.` },
				frequency: { type: "string", enum: [...SCHEDULE_FREQUENCIES], description: "hourly, daily, weekdays (Monday to Friday), weekly or monthly." },
				time: { type: "string", description: "The local time, 24-hour HH:MM, e.g. 09:00. For hourly only the minutes count: 00:15 runs at a quarter past every hour." },
				day_of_week: { type: "string", enum: [...DAYS], description: "For weekly: the day it runs." },
				day_of_month: { type: "integer", minimum: 1, maximum: 31, description: "For monthly: the day it runs; in shorter months, their last day." },
			},
			required: ["title", "prompt", "frequency", "time"],
			additionalProperties: false,
		},
		onError: "return-to-model",
		execute: async (input: Record<string, unknown>) => {
			const title = oneLine(text(input.title, "title", MAX_SCHEDULE_TITLE_CHARS));
			const prompt = text(input.prompt, "prompt", MAX_SCHEDULE_PROMPT_CHARS);
			const timing = timingInput(input);
			// Its title and prompt are kept: after a search they could carry what it found.
			const refused = await savingRefusal(context.searched);
			if (refused) return { saved: false, note: refused };
			const creationKey = await scheduleCreationKey(context.runKey, channel, title, timing);
			const zone = await personTimeZone(slack, slackUserId);
			const result = await db.rpc<{ status: string; schedule?: ScheduleRow; limit?: number }>("save_slack_agent_schedule", {
				p_installation_id: installationId,
				p_channel_id: channel,
				p_title: title,
				p_prompt: prompt,
				p_frequency: timing.frequency,
				p_hour: timing.hour,
				p_minute: timing.minute,
				p_day_of_week: timing.day_of_week,
				p_day_of_month: timing.day_of_month,
				p_timezone: zone.timezone,
				p_created_by: slackUserId,
				p_creation_key: creationKey,
			});
			notes.push(`schedule_task ${timing.frequency}`);
			switch (result?.status) {
				case "saved": {
					const schedule = result.schedule!;
					return {
						saved: true,
						id: schedule.id,
						title: schedule.title,
						runs: describeTiming(schedule),
						where: "this conversation",
						next_run: formatRunTime(schedule.next_run_at, schedule.timezone),
						...(zone.fallback ? { note: "Slack didn't give this person's time zone, so the times are UTC. Say so." } : {}),
					};
				}
				case "full":
					return { saved: false, note: `This workspace has ${result.limit ?? 20} recurring tasks, the most its admins allow. Someone can cancel one first, or an admin can raise the limit in Phaseo settings.` };
				case "off":
					return { saved: false, note: "An admin has turned recurring tasks off in Phaseo, so nothing was set up." };
				case "link_required":
					return { saved: false, note: "Only people who connected their Phaseo account can set up recurring tasks in this workspace. They can connect it from the Phaseo agent's Home tab in Slack." };
				default:
					return { saved: false, note: "The Phaseo agent is no longer installed here." };
			}
		},
	}, ...tools];
}
