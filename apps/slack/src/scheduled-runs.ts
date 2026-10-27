import { isLinked, userFacts } from "./access";
import { botToken, coordinatorFor, emailAdminsAboutRefusal, meterFor, meterSettings, recordRefusal, threadKey, type Deps } from "./events";
import { loadInstallation, type Installation } from "./installations";
import type { RefuseReason } from "./meter";
import { describeTiming, slackText, type ScheduleTiming } from "./schedules";
import { usersInfo } from "./slack-api";
import type { TurnRef } from "./turns";

// Running recurring tasks (schedules.ts), from the Worker's cron trigger: every
// minute in production (wrangler.jsonc). One database call claims the runs that
// are due (claim_slack_agent_schedules: each run once, whichever tick gets it,
// and never more than once an hour). For each run:
//
//   1. the installation is active and its creator may still use the agent:
//      linked where that is required, and not a bot, deactivated, or a guest or
//      someone from another organisation the installation doesn't answer
//   2. the meter admits it as an answer for the creator, like a message (plan
//      people, the people limit, the spending cap, answers per hour); the run's
//      event id makes admitting it again a no-op
//   3. a short "Scheduled: <title>" message goes to the conversation
//   4. the turn is queued in that message's thread coordinator, like a mention,
//      and runs as an AgentTurnWorkflow: the same checks again, the $0.50 and
//      12-step limits, the usual footer, and the meter counts it as one answer
//
// A run that can't start is recorded (record_slack_agent_schedule_run). When the
// creator lost access, the installation is paused, or the agent can't post in
// the conversation, the schedule pauses with that reason; anything else counts
// as a failure, and the third failure in a row pauses it. The creator is told
// privately (a message in the app's DM) when it pauses for failures or because
// the agent can't post there. The run's answer reports back the same way when
// its turn finishes (workflow.ts).
//
// Logs carry ids and outcomes only, never a schedule's text.

/** Runs claimed per tick; any more wait for the next minute. */
export const CLAIM_LIMIT = 50;
/** Runs started at once within a tick. */
const PARALLEL_RUNS = 5;
/** chat.postMessage errors that mean the agent can't post in the conversation any more. */
const CANT_POST = new Set([
	"not_in_channel", "channel_not_found", "is_archived", "restricted_action", "restricted_action_read_only_channel",
	"restricted_action_thread_only_channel", "restricted_action_non_threadable_channel", "team_access_not_granted", "messages_tab_disabled",
]);
/** Pauses the creator is told about privately. Someone who lost access isn't messaged. */
const TOLD = new Set(["failures", "not_in_channel"]);

/** A due run, as claim_slack_agent_schedules returns it. */
export type ClaimedRun = ScheduleTiming & {
	schedule_id: string;
	installation_id: string;
	channel_id: string;
	title: string;
	prompt: string;
	created_by: string;
	/** When it was due; keys the run. */
	run_at: string;
};

/** What became of a run. pause: stop the schedule now, with reason as the pause reason. */
export type RunOutcome = { result: "answered" } | RunMissed;
export type RunMissed = { result: "failed" | "skipped"; reason: string; pause?: boolean };

type Recorded = { recorded: boolean; paused: boolean; pause_reason?: string | null; created_by?: string; channel_id?: string; title?: string };

/** The run's Slack-event stand-in: the meter's pending answer, the Workflow instance (turn-…) and the gateway session (slack-…). */
export function scheduledEventId(scheduleId: string, runAt: string): string {
	return `Sched${scheduleId.replace(/-/g, "").toLowerCase()}${Math.floor(Date.parse(runAt) / 1000)}`;
}

/** What the turn answers: the task and its prompt. Kept in the thread's coordinator, like a message. */
export function scheduledTurnText(run: Pick<ClaimedRun, "title" | "prompt"> & ScheduleTiming): string {
	return `Task: ${run.title}\nRuns: ${describeTiming(run)}\n\n${run.prompt}`;
}

/** The short top-level message each run answers in the thread of. */
export function scheduledMessage(run: Pick<ClaimedRun, "title"> & ScheduleTiming): { text: string; blocks: unknown[] } {
	return {
		text: `Scheduled: ${run.title}`,
		blocks: [
			{ type: "section", text: { type: "mrkdwn", text: `*Scheduled:* ${slackText(run.title)}` } },
			{ type: "context", elements: [{ type: "mrkdwn", text: `A recurring task, ${slackText(describeTiming(run))}.` }] },
		],
	};
}

/** The private note to the creator when their schedule pauses. */
export function pausedNotice(recorded: Pick<Recorded, "pause_reason" | "title" | "channel_id">): string {
	const title = `"${slackText(recorded.title ?? "")}"`;
	const after = "A Phaseo workspace owner or admin can resume it in Phaseo settings, or you can ask me to set it up again.";
	if (recorded.pause_reason === "not_in_channel") {
		const place = recorded.channel_id?.startsWith("D") ? "our direct messages" : `<#${recorded.channel_id}>`;
		return `I've paused your recurring task ${title} because I can't post in ${place} any more. Invite me back first. ${after}`;
	}
	return `I've paused your recurring task ${title} because its last 3 runs didn't go through. ${after}`;
}

/**
 * Records what became of a run, once (a repeat changes nothing), and tells the
 * creator privately when that paused the schedule for failures or because the
 * agent can't post there. Never throws.
 */
export async function reportScheduledRun(deps: Deps, run: { scheduleId: string; runAt: string; installationId: string }, outcome: RunOutcome, installation?: Installation | null): Promise<void> {
	let recorded: Recorded | null;
	try {
		recorded = await deps.db.rpc<Recorded>("record_slack_agent_schedule_run", {
			p_schedule_id: run.scheduleId,
			p_run_at: run.runAt,
			p_result: outcome.result,
			p_reason: outcome.result === "answered" ? null : outcome.reason,
			p_pause: outcome.result !== "answered" && outcome.pause === true,
		});
	} catch {
		console.error("[slack-agent] scheduled run not recorded", { scheduleId: run.scheduleId, result: outcome.result });
		return;
	}
	if (!recorded?.paused || !recorded.created_by || !TOLD.has(recorded.pause_reason ?? "")) return;
	console.log("[slack-agent] schedule paused", { scheduleId: run.scheduleId, reason: recorded.pause_reason });
	try {
		const live = installation ?? await loadInstallation(deps.db, run.installationId);
		const token = live ? await botToken(deps, live) : null;
		if (!token) return;
		// A user id as the channel: the app's direct message with them.
		const sent = await deps.slack(token).call("chat.postMessage", { channel: recorded.created_by, text: pausedNotice(recorded) });
		if (!sent.ok) console.warn("[slack-agent] creator not told the schedule paused", { scheduleId: run.scheduleId });
	} catch {
		console.error("[slack-agent] creator not told the schedule paused", { scheduleId: run.scheduleId });
	}
}

/** What a turn the AgentTurnWorkflow skipped (its load step) means for its schedule. */
export function skippedTurnOutcome(reason: string): RunMissed {
	switch (reason) {
		case "link_required":
			return { result: "skipped", reason: "creator_access", pause: true };
		case "payment_due":
			return { result: "skipped", reason: "payment_due", pause: true };
		case "paused":
		case "uninstalled":
		case "no_installation":
			return { result: "skipped", reason: "installation_paused", pause: true };
		default:
			return { result: "failed", reason: "load_failed" };
	}
}

/** A refusal from the meter: lost access and a paused installation pause the schedule; limits are a skipped run. */
function refusedOutcome(reason: RefuseReason): RunMissed {
	switch (reason) {
		case "bot":
		case "external_user":
		case "guest":
			return { result: "skipped", reason: "creator_access", pause: true };
		case "payment_due":
			return { result: "skipped", reason: "payment_due", pause: true };
		case "paused":
		case "uninstalled":
			return { result: "skipped", reason: "installation_paused", pause: true };
		default:
			return { result: "skipped", reason };
	}
}

/** Starts one claimed run: the checks, the meter, the "Scheduled:" message and the turn. Never throws. */
export async function startScheduledRun(deps: Deps, run: ClaimedRun, installations = new Map<string, Promise<Installation | null>>()): Promise<"started" | "skipped" | "failed"> {
	const now = deps.now();
	const eventId = scheduledEventId(run.schedule_id, run.run_at);
	const ref = { scheduleId: run.schedule_id, runAt: run.run_at, installationId: run.installation_id };
	const meter = meterFor(deps.env, run.installation_id);
	let admitted = false;
	let installation: Installation | null = null;
	const end = async (outcome: RunMissed): Promise<"skipped" | "failed"> => {
		if (admitted) {
			try {
				await meter.release({ eventId });
			} catch {
				console.error("[slack-agent] meter release failed", { installationId: run.installation_id });
			}
		}
		console.log("[slack-agent] scheduled run not started", { scheduleId: run.schedule_id, installationId: run.installation_id, result: outcome.result, reason: outcome.reason });
		await reportScheduledRun(deps, ref, outcome, installation);
		return outcome.result;
	};
	try {
		if (!installations.has(run.installation_id)) installations.set(run.installation_id, loadInstallation(deps.db, run.installation_id));
		installation = await installations.get(run.installation_id)!;
		if (!installation || installation.status !== "active") {
			return await end({ result: "skipped", reason: installation?.status === "payment_due" ? "payment_due" : "installation_paused", pause: true });
		}
		const token = await botToken(deps, installation);
		if (!token) return await end({ result: "failed", reason: "slack_unavailable" });
		const slack = deps.slack(token);

		// The creator may still use the agent here.
		const linkNeeded = installation.access_mode === "linked" || installation.schedule_creators === "linked";
		if (linkNeeded && !(await isLinked(deps.db, installation.id, run.created_by))) return await end({ result: "skipped", reason: "creator_access", pause: true });
		const user = await usersInfo(slack, run.created_by);
		if (user.ok === false) {
			return await end(user.error === "user_not_found" ? { result: "skipped", reason: "creator_access", pause: true } : { result: "failed", reason: "user_unverified" });
		}
		if (user.data.deleted) return await end({ result: "skipped", reason: "creator_access", pause: true });
		const facts = userFacts(user.data, installation);

		const admit = await meter.admit({ settings: meterSettings(installation), slackUserId: run.created_by, facts, eventId, now });
		if (admit.allowed === false) {
			await Promise.all([
				admit.auditForAdmins ? recordRefusal(deps.db, installation, run.created_by, admit) : undefined,
				emailAdminsAboutRefusal(deps.db, installation, admit.reason, admit.people),
			]);
			return await end(refusedOutcome(admit.reason));
		}
		admitted = true;

		const message = scheduledMessage(run);
		const posted = await slack.call<{ ts?: string }>("chat.postMessage", { channel: run.channel_id, text: message.text, blocks: message.blocks, unfurl_links: false, unfurl_media: false });
		if (posted.ok === false || typeof posted.data.ts !== "string") {
			const cantPost = posted.ok === false && CANT_POST.has(posted.error);
			return await end(cantPost ? { result: "skipped", reason: "not_in_channel", pause: true } : { result: "failed", reason: "slack_post_failed" });
		}

		const ts = posted.data.ts;
		const key = threadKey(installation.id, run.channel_id, ts);
		const turn: Omit<TurnRef, "turnId"> = {
			threadKey: key,
			eventId,
			installationId: installation.id,
			teamId: installation.team_id,
			channel: run.channel_id,
			threadTs: ts,
			messageTs: ts,
			slackUserId: run.created_by,
			kind: run.channel_id.startsWith("D") ? "dm" : "mention",
			...(facts.isExternal ? { external: true } : {}),
			schedule: { id: run.schedule_id, runAt: run.run_at },
		};
		const queued = await coordinatorFor(deps.env, key).enqueue({ ...turn, text: scheduledTurnText(run) }, now);
		if (queued.status === "queue_full") return await end({ result: "failed", reason: "busy" });
		console.log("[slack-agent] scheduled run started", { scheduleId: run.schedule_id, installationId: installation.id, status: queued.status });
		return "started";
	} catch (error) {
		console.error("[slack-agent] scheduled run failed to start", { scheduleId: run.schedule_id, error: error instanceof Error ? error.message : "unknown" });
		return end({ result: "failed", reason: "failed" });
	}
}

/** The cron trigger: claims the due runs and starts them, a few at a time. Never throws. */
export async function runDueSchedules(deps: Deps): Promise<{ claimed: number; started: number }> {
	let runs: ClaimedRun[];
	try {
		runs = (await deps.db.rpc<ClaimedRun[] | null>("claim_slack_agent_schedules", { p_limit: CLAIM_LIMIT })) ?? [];
	} catch {
		console.error("[slack-agent] due schedules not claimed");
		return { claimed: 0, started: 0 };
	}
	const installations = new Map<string, Promise<Installation | null>>();
	let started = 0;
	for (let index = 0; index < runs.length; index += PARALLEL_RUNS) {
		const results = await Promise.all(runs.slice(index, index + PARALLEL_RUNS).map((run) => startScheduledRun(deps, run, installations)));
		started += results.filter((result) => result === "started").length;
	}
	if (runs.length) console.log("[slack-agent] scheduled runs claimed", { claimed: runs.length, started });
	return { claimed: runs.length, started };
}
