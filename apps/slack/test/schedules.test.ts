import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunner, AgentTurnHooks, AgentTurnOutput, AgentTurnRequest } from "../src/agent";
import { clearUserFactsCache } from "../src/access";
import { TURN_TIMEOUT_MS } from "../src/coordinator";
import { homeView, publishHome, type HomeFacts } from "../src/home";
import { ORIGINAL_BOT_SCOPES, type Installation } from "../src/installations";
import { pausedNotice, runDueSchedules, scheduledEventId, scheduledMessage, startScheduledRun, type ClaimedRun } from "../src/scheduled-runs";
import { describeTiming, formatRunTime, lastRunText, scheduleCreationKey, scheduleMode, scheduleTools, timingInput, type ScheduleRow } from "../src/schedules";
import type { TurnRef } from "../src/turns";
import { runTurn, type StepConfig, type StepRunner } from "../src/workflow";
import { BOT_TOKEN, INSTALLATION_ID, installationRow, storageOf, TEAM_ID, testWorld, type TestWorld } from "./fakes";

const NOW = Date.UTC(2026, 9, 27, 9, 0, 30);
const SCHEDULE_ID = "00000000-0000-4000-8000-00000000e5c1";
const PERSON = "U0PERSON01";
const CHANNEL = "C0CHANNEL1";
const RUN_AT = "2026-10-27T09:00:00+00:00";

let world: TestWorld;

async function install(overrides: Partial<Installation> = {}) {
	world.db.tables.slack_installations = [await installationRow(overrides)];
}

function claimed(overrides: Partial<ClaimedRun> = {}): ClaimedRun {
	return {
		schedule_id: SCHEDULE_ID,
		installation_id: INSTALLATION_ID,
		channel_id: CHANNEL,
		title: "Weekly <spend> & models",
		prompt: "Summarise last week's Phaseo spend by model.",
		created_by: PERSON,
		frequency: "weekdays",
		hour: 9,
		minute: 0,
		day_of_week: null,
		day_of_month: null,
		timezone: "Europe/London",
		run_at: RUN_AT,
		...overrides,
	};
}

function rpcCalls(fn: string) {
	return world.db.rpcs.filter((call) => call.fn === fn).map((call) => call.args);
}

function meter() {
	return world.meters.get(world.meters.idFromName(INSTALLATION_ID));
}

/** Makes one database function fail `times` times, as if Postgres were unavailable, then answer again. */
function failRpc(fn: string, times: number) {
	const rpc = world.db.rpc.bind(world.db);
	let left = times;
	world.db.rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
		if (name === fn && left > 0) {
			left -= 1;
			world.db.rpcs.push({ fn: name, args });
			throw new Error("database unavailable");
		}
		return rpc<T>(name, args);
	};
}

/** Runs steps like Workflows does (retries up to the limit, outputs kept as JSON). */
class FakeStep implements StepRunner {
	names: string[] = [];
	async waitForEvent(): Promise<unknown> {
		throw new Error("no questions in a scheduled run");
	}
	async do<T>(name: string, config: StepConfig, callback: (context: { attempt: number }) => Promise<T>): Promise<T> {
		for (let attempt = 1; ; attempt += 1) {
			try {
				const output = JSON.parse(JSON.stringify((await callback({ attempt })) ?? null)) as T;
				this.names.push(name);
				return output;
			} catch (error) {
				if (attempt > (config.retries?.limit ?? 0)) throw error;
			}
		}
	}
}

class ScriptedAgent implements AgentRunner {
	requests: AgentTurnRequest[] = [];
	constructor(private readonly script: (hooks: AgentTurnHooks) => Promise<AgentTurnOutput>) {}
	async run(request: AgentTurnRequest, hooks: AgentTurnHooks) {
		this.requests.push(request);
		return this.script(hooks);
	}
	async ask(): Promise<never> {
		throw new Error("unexpected ask");
	}
}

beforeEach(async () => {
	world = testWorld({ now: NOW });
	clearUserFactsCache();
	await install();
	world.slack.users.set(PERSON, { id: PERSON, team_id: TEAM_ID, tz: "Europe/London" });
	world.db.rpcResults.record_slack_agent_schedule_run = { recorded: true, paused: false };
});

describe("schedule timing", () => {
	it("describes how often a schedule runs, in its time zone", () => {
		const base = { hour: 9, minute: 5, day_of_week: null, day_of_month: null, timezone: "Europe/London" };
		expect(describeTiming({ ...base, frequency: "hourly", hour: null })).toBe("every hour at 05 minutes past (Europe/London time)");
		expect(describeTiming({ ...base, frequency: "daily" })).toBe("every day at 09:05 (Europe/London time)");
		expect(describeTiming({ ...base, frequency: "weekdays" })).toBe("every weekday, Monday to Friday, at 09:05 (Europe/London time)");
		expect(describeTiming({ ...base, frequency: "weekly", day_of_week: 7 })).toBe("every Sunday at 09:05 (Europe/London time)");
		expect(describeTiming({ ...base, frequency: "monthly", day_of_month: 1 })).toBe("on the 1st of every month at 09:05 (Europe/London time)");
		expect(describeTiming({ ...base, frequency: "monthly", day_of_month: 31 })).toBe("on the 31st of every month (or its last day) at 09:05 (Europe/London time)");
		expect(describeTiming({ ...base, frequency: "monthly", day_of_month: 12 })).toContain("12th");
	});

	it("shows a run time in the schedule's own time zone", () => {
		expect(formatRunTime("2026-11-02T14:00:00+00:00", "America/New_York")).toBe("Mon, Nov 2, 2026, 09:00 (America/New_York)");
		expect(formatRunTime("2026-11-02T14:00:00Z", "Not/AZone")).toBe("2026-11-02 14:00 UTC");
	});

	it("reads the tool's frequency, time and day", () => {
		expect(timingInput({ frequency: "hourly", time: "00:15" })).toEqual({ frequency: "hourly", hour: null, minute: 15, day_of_week: null, day_of_month: null });
		expect(timingInput({ frequency: "weekly", time: "17:30", day_of_week: "Wednesday" })).toMatchObject({ hour: 17, minute: 30, day_of_week: 3 });
		expect(timingInput({ frequency: "monthly", time: "9:00", day_of_month: 31 })).toMatchObject({ hour: 9, day_of_month: 31 });
		// A day only counts for weekly.
		expect(timingInput({ frequency: "daily", time: "08:00", day_of_week: "monday" })).toMatchObject({ day_of_week: null });
		expect(() => timingInput({ frequency: "every_minute", time: "09:00" })).toThrow(/frequency must be one of/);
		expect(() => timingInput({ frequency: "daily", time: "24:00" })).toThrow(/24-hour/);
		expect(() => timingInput({ frequency: "weekly", time: "09:00" })).toThrow(/day_of_week is required/);
		expect(() => timingInput({ frequency: "monthly", time: "09:00", day_of_month: 32 })).toThrow(/day_of_month is required/);
	});

	it("decides what a turn may do with recurring tasks", () => {
		expect(scheduleMode({ schedules_enabled: true }, {})).toBe("create");
		expect(scheduleMode({ schedules_enabled: false }, {})).toBe("off");
		expect(scheduleMode({ schedules_enabled: true }, { external: true })).toBe("external");
		expect(scheduleMode({ schedules_enabled: true }, { schedule: { id: SCHEDULE_ID, runAt: RUN_AT } })).toBe("run");
	});
});

describe("schedule tools", () => {
	const tools = (canCreate = true, channel = CHANNEL, searched = false) => {
		const notes: string[] = [];
		const list = scheduleTools({ db: world.db, slack: world.slack.client(BOT_TOKEN), installationId: INSTALLATION_ID, channel, slackUserId: PERSON, canCreate, runKey: "Ev0SAVE0001:0", notes, searched: async () => searched });
		const byId = (id: string) => list.find((tool) => tool.id === id)!;
		return { list, notes, run: (id: string, input: Record<string, unknown> = {}) => (byId(id).execute as (input: unknown) => Promise<any>)(input) };
	};
	const savedRow = (overrides: Partial<ScheduleRow> = {}): ScheduleRow => ({
		id: SCHEDULE_ID, channel_id: CHANNEL, title: "Weekly spend", prompt: "Summarise it.", created_by: PERSON, status: "active", pause_reason: null,
		next_run_at: "2026-11-02T09:00:00+00:00", last_result: null, last_result_reason: null, frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null, timezone: "Europe/London",
		...overrides,
	});

	it("schedule_task saves a self-contained prompt here, in the person's Slack time zone, and says when it runs next", async () => {
		world.db.rpcResults.save_slack_agent_schedule = { status: "saved", schedule: savedRow() };
		const { run, notes } = tools();
		const result = await run("schedule_task", { title: "  Weekly   spend ", prompt: "Summarise it.", frequency: "weekly", time: "09:00", day_of_week: "monday" });
		expect(rpcCalls("save_slack_agent_schedule")).toEqual([{
			p_installation_id: INSTALLATION_ID, p_channel_id: CHANNEL, p_title: "Weekly spend", p_prompt: "Summarise it.", p_frequency: "weekly",
			p_hour: 9, p_minute: 0, p_day_of_week: 1, p_day_of_month: null, p_timezone: "Europe/London", p_created_by: PERSON, p_creation_key: await scheduleCreationKey("Ev0SAVE0001:0", CHANNEL, "Weekly spend", { frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null }),
		}]);
		expect(rpcCalls("save_slack_agent_schedule")[0].p_creation_key).toMatch(/^Ev0SAVE0001:0:[0-9a-f]{24}$/);
		expect(world.slack.of("users.info").map((call) => call.args.user)).toEqual([PERSON]);
		expect(result).toEqual({
			saved: true, id: SCHEDULE_ID, title: "Weekly spend", runs: "every Monday at 09:00 (Europe/London time)", where: "this conversation",
			next_run: "Mon, Nov 2, 2026, 09:00 (Europe/London)",
		});
		expect(notes).toEqual(["schedule_task weekly"]);
	});

	it("keys each save by the turn's event, its run and what it sets up, so a retried run step saves nothing twice and loses no task", async () => {
		world.db.rpcResults.save_slack_agent_schedule = { status: "saved", schedule: savedRow() };
		const ts = "1792600000.000001";
		const threadKey = `${INSTALLATION_ID}:${CHANNEL}:${ts}`;
		await world.threads.get(world.threads.idFromName(threadKey)).enqueue({
			threadKey, eventId: "Ev0SAVE0001", installationId: INSTALLATION_ID, teamId: TEAM_ID, channel: CHANNEL, threadTs: ts, messageTs: ts,
			slackUserId: PERSON, kind: "mention", text: "Every Monday at 9, summarise our spend.",
		}, NOW);
		const turn = world.turns.created[0].params as TurnRef;
		const input = { title: "Weekly spend", prompt: "Summarise it.", frequency: "weekly", time: "09:00", day_of_week: "monday" };
		let attempts = 0;
		const agent = new ScriptedAgent(async (hooks) => {
			attempts += 1;
			const save = agent.requests.at(-1)!.tools.find((tool) => tool.id === "schedule_task")!.execute as (input: unknown) => Promise<unknown>;
			await expect(save({ ...input, time: "25:00" })).rejects.toThrow(/24-hour/);
			// The retry saves the other task first (it saw the first one listed), then the first again.
			if (attempts === 2) await save({ ...input, title: "Monthly spend", frequency: "monthly", day_of_month: 1 });
			await save(input);
			await hooks.onText("Saved.");
			if (attempts === 1) {
				// The step dies after the schedule was saved (here: the coordinator can't stage the answer), so the model runs again.
				const coordinator = world.threads.get(world.threads.idFromName(threadKey));
				const stage = coordinator.stageTurnOutput.bind(coordinator);
				coordinator.stageTurnOutput = () => {
					coordinator.stageTurnOutput = stage;
					throw new Error("storage_unavailable");
				};
			}
			return { costUsd: 0.01, model: "openai/gpt-test", stopReason: null };
		});
		await expect(runTurn({ ...world.deps, agent }, turn, new FakeStep())).resolves.toEqual({ status: "answered" });
		expect(attempts).toBe(2);
		const weekly = await scheduleCreationKey("Ev0SAVE0001:0", CHANNEL, "Weekly spend", { frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null });
		const monthly = await scheduleCreationKey("Ev0SAVE0001:0", CHANNEL, "Monthly spend", { frequency: "monthly", hour: 9, minute: 0, day_of_week: null, day_of_month: 1 });
		expect(monthly).not.toBe(weekly);
		expect(rpcCalls("save_slack_agent_schedule").map((args) => args.p_creation_key)).toEqual([weekly, monthly, weekly]);
		// The same task again, renamed only in case or spacing, is the same task.
		expect(await scheduleCreationKey("Ev0SAVE0001:0", CHANNEL, " weekly SPEND ", { frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null })).toBe(weekly);
	});

	it("falls back to UTC, and says so, when Slack gives no time zone it knows", async () => {
		world.slack.users.set(PERSON, { id: PERSON, team_id: TEAM_ID, tz: "Not a zone" });
		world.db.rpcResults.save_slack_agent_schedule = { status: "saved", schedule: savedRow({ timezone: "UTC" }) };
		const result = await tools().run("schedule_task", { title: "Daily", prompt: "Do it.", frequency: "daily", time: "09:00" });
		expect(rpcCalls("save_slack_agent_schedule")[0].p_timezone).toBe("UTC");
		expect(result.note).toMatch(/UTC/);
	});

	it("says why nothing was saved: the workspace's maximum, recurring tasks off, an account to connect", async () => {
		const { run } = tools();
		const input = { title: "Daily", prompt: "Do it.", frequency: "daily", time: "09:00" };
		world.db.rpcResults.save_slack_agent_schedule = { status: "full", limit: 20 };
		expect(await run("schedule_task", input)).toEqual({ saved: false, note: expect.stringContaining("20 recurring tasks") });
		world.db.rpcResults.save_slack_agent_schedule = { status: "off" };
		expect((await run("schedule_task", input)).note).toMatch(/turned recurring tasks off/);
		world.db.rpcResults.save_slack_agent_schedule = { status: "link_required" };
		expect((await run("schedule_task", input)).note).toMatch(/connected their Phaseo account/);
		world.db.rpcResults.save_slack_agent_schedule = { status: "not_installed" };
		expect((await run("schedule_task", input)).note).toMatch(/no longer installed/);
		await expect(run("schedule_task", { ...input, title: "x".repeat(81) })).rejects.toThrow(/at most 80/);
		await expect(run("schedule_task", { ...input, prompt: "x".repeat(2_001) })).rejects.toThrow(/at most 2,000/);
	});

	it("lists only this conversation's in a channel, never the person's tasks elsewhere", async () => {
		await tools().run("list_schedules");
		const query = world.db.queries.at(-1)?.query;
		expect(query).toMatchObject({ installation_id: `eq.${INSTALLATION_ID}`, channel_id: `eq.${CHANNEL}` });
		expect(query).not.toHaveProperty("or");
	});

	it("lists this conversation's and the person's own in a direct message, and cancels by id", async () => {
		const DM = "D0DIRECT01";
		world.db.tables.slack_agent_schedules = [
			{ ...savedRow({ channel_id: DM, last_result: "skipped", last_result_reason: "installation_paused" }), installation_id: INSTALLATION_ID, created_at: "2026-10-20T09:00:00Z" },
			{ ...savedRow({ id: "00000000-0000-4000-8000-00000000e5c2", channel_id: "C0OTHER001", status: "paused", pause_reason: "failures", last_result: "failed" }), installation_id: INSTALLATION_ID, created_at: "2026-10-21T09:00:00Z" },
		];
		const { run, notes } = tools(true, DM);
		const { schedules } = await run("list_schedules");
		expect(world.db.queries.at(-1)?.query).toMatchObject({ installation_id: `eq.${INSTALLATION_ID}`, or: `(channel_id.eq.${DM},created_by.eq.${PERSON})` });
		expect(schedules).toEqual([
			{ id: SCHEDULE_ID, title: "Weekly spend", prompt: "Summarise it.", runs: "every Monday at 09:00 (Europe/London time)", where: "this conversation", status: "active", next_run: "Mon, Nov 2, 2026, 09:00 (Europe/London)", last_run: "skipped: the agent was paused", set_up_by: `<@${PERSON}>` },
			{ id: "00000000-0000-4000-8000-00000000e5c2", title: "Weekly spend", prompt: "Summarise it.", runs: "every Monday at 09:00 (Europe/London time)", where: "<#C0OTHER001>", status: "paused after 3 runs in a row didn't go through", last_run: "failed", set_up_by: `<@${PERSON}>` },
		]);

		world.db.rpcResults.cancel_slack_agent_schedule = "deleted";
		expect(await run("cancel_schedule", { id: SCHEDULE_ID.toUpperCase() })).toEqual({ cancelled: true });
		expect(rpcCalls("cancel_slack_agent_schedule")).toEqual([{ p_installation_id: INSTALLATION_ID, p_schedule_id: SCHEDULE_ID, p_slack_user_id: PERSON }]);
		world.db.rpcResults.cancel_slack_agent_schedule = "not_allowed";
		expect((await run("cancel_schedule", { id: SCHEDULE_ID })).note).toMatch(/owner or admin/);
		world.db.rpcResults.cancel_slack_agent_schedule = "not_found";
		expect((await run("cancel_schedule", { id: SCHEDULE_ID })).note).toMatch(/no recurring task with that id/);
		await expect(run("cancel_schedule", { id: "1" })).rejects.toThrow(/id must be/);
		expect(notes).toEqual(["list_schedules", "cancel_schedule", "cancel_schedule", "cancel_schedule"]);
	});

	it("schedule_task saves nothing once the answer has searched Slack, and says why; listing and cancelling still work", async () => {
		const { run, notes } = tools(true, CHANNEL, true);
		const input = { title: "Launch digest", prompt: "We ship the launch plan on Friday.", frequency: "daily", time: "09:00" };
		await expect(run("schedule_task", { ...input, time: "25:00" })).rejects.toThrow(/24-hour/);
		expect(await run("schedule_task", input)).toEqual({ saved: false, note: expect.stringContaining("you searched Slack in this answer") });
		expect(rpcCalls("save_slack_agent_schedule")).toEqual([]);
		expect(world.slack.of("users.info")).toEqual([]);
		expect(await run("list_schedules")).toEqual({ schedules: [] });
		world.db.rpcResults.cancel_slack_agent_schedule = "deleted";
		expect(await run("cancel_schedule", { id: SCHEDULE_ID })).toEqual({ cancelled: true });
		expect(notes).toEqual(["list_schedules", "cancel_schedule"]);
	});

	it("says why the last run was skipped", () => {
		expect(lastRunText("skipped", "installation_paused")).toBe("skipped: the agent was paused");
		expect(lastRunText("skipped", "payment_due")).toBe("skipped: a Phaseo bill was unpaid");
		expect(lastRunText("skipped", "schedules_off")).toBe("skipped: recurring tasks were off");
		expect(lastRunText("skipped", "monthly_cap")).toBe("skipped: a usage limit was reached");
		expect(lastRunText("skipped", "something_new")).toBe("skipped");
		expect(lastRunText("failed", "failed")).toBe("failed");
		expect(lastRunText("answered", null)).toBe("answered");
	});

	it("leaves out schedule_task where the turn can't set one up", () => {
		expect(tools(false).list.map((tool) => tool.id)).toEqual(["list_schedules", "cancel_schedule"]);
		expect(tools(true).list.map((tool) => tool.id)).toEqual(["schedule_task", "list_schedules", "cancel_schedule"]);
	});
});

describe("scheduled runs", () => {
	it("posts a short Scheduled: message and queues the run as the creator's turn in its thread, admitted by the meter", async () => {
		const result = await startScheduledRun(world.deps, claimed());
		expect(result).toBe("started");
		const [post] = world.slack.of("chat.postMessage");
		expect(post.args).toMatchObject({
			channel: CHANNEL,
			text: "Scheduled: Weekly &lt;spend&gt; &amp; models",
			parse: "none",
			blocks: [
				{ type: "section", text: { type: "mrkdwn", text: "*Scheduled:* Weekly &lt;spend&gt; &amp; models", verbatim: true } },
				{ type: "context", elements: [{ type: "mrkdwn", text: "A recurring task, every weekday, Monday to Friday, at 09:00 (Europe/London time)." }] },
			],
		});
		const eventId = scheduledEventId(SCHEDULE_ID, RUN_AT);
		expect(eventId).toBe(`Sched${SCHEDULE_ID.replace(/-/g, "")}${Date.UTC(2026, 9, 27, 9) / 1000}`);
		// The coordinator started the turn's Workflow with ids only.
		expect(world.turns.created).toHaveLength(1);
		const ts = "1792600100.000001";
		expect(world.turns.created[0]).toMatchObject({
			id: `turn-${eventId}`,
			params: {
				threadKey: `${INSTALLATION_ID}:${CHANNEL}:${ts}`, eventId, installationId: INSTALLATION_ID, teamId: TEAM_ID, channel: CHANNEL,
				threadTs: ts, messageTs: ts, slackUserId: PERSON, kind: "mention", schedule: { id: SCHEDULE_ID, runAt: RUN_AT },
			},
		});
		expect(JSON.stringify(world.turns.created[0].params)).not.toContain("spend");
		const coordinator = world.threads.get(world.threads.idFromName(`${INSTALLATION_ID}:${CHANNEL}:${ts}`));
		expect(coordinator.turnInput(1)?.text).toBe("Task: Weekly <spend> & models\nRuns: every weekday, Monday to Friday, at 09:00 (Europe/London time)\n\nSummarise last week's Phaseo spend by model.");
		expect(meter().usage(NOW)).toMatchObject({ people: 1, answers: 0, pending: 1 });
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([]);
	});

	it("never turns a title's @here, @channel, @everyone or <!here> into a mention", () => {
		const message = scheduledMessage({ ...claimed(), title: "@here <!channel> @everyone standup" });
		expect(message.text).toBe("Scheduled: @here &lt;!channel&gt; @everyone standup");
		expect(message.blocks[0]).toEqual({ type: "section", text: { type: "mrkdwn", text: "*Scheduled:* @here &lt;!channel&gt; @everyone standup", verbatim: true } });
		expect(pausedNotice({ pause_reason: "failures", title: "<!here> standup", channel_id: CHANNEL })).toContain("\"&lt;!here&gt; standup\"");
	});

	it("skips and pauses when the creator can no longer use the agent, without posting", async () => {
		await install({ schedule_creators: "linked" });
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		world.slack.users.set(PERSON, { id: PERSON, team_id: TEAM_ID, deleted: true });
		await install();
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		await install({ allow_guests: false });
		world.slack.users.set(PERSON, { id: PERSON, team_id: TEAM_ID, is_restricted: true });
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual(Array(3).fill({
			p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "skipped", p_reason: "creator_access", p_pause: true,
		}));
		expect(world.slack.of("chat.postMessage")).toEqual([]);
		expect(meter().usage(NOW)).toMatchObject({ pending: 0 });
	});

	it("skips a run the meter refuses (the spending cap) without pausing, and tells admins as a message would", async () => {
		await install({ monthly_cap_nanos: 1 });
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "skipped", p_reason: "monthly_cap", p_pause: false }]);
		expect(rpcCalls("queue_slack_agent_refusal_email")).toEqual([{ p_installation_id: INSTALLATION_ID, p_reason: "monthly_cap", p_people: 0 }]);
		expect(world.db.tables.workspace_audit_events.map((event) => event.action)).toEqual(["slack_agent.answer_refused"]);
		expect(world.slack.of("chat.postMessage")).toEqual([]);
	});

	it("pauses when the agent can't post in the conversation, gives the meter place back and tells the creator privately", async () => {
		world.slack.failures.set("chat.postMessage", ["not_in_channel"]);
		world.db.rpcResults.record_slack_agent_schedule_run = { recorded: true, paused: true, pause_reason: "not_in_channel", created_by: PERSON, channel_id: CHANNEL, title: "Weekly spend" };
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "skipped", p_reason: "not_in_channel", p_pause: true }]);
		expect(meter().usage(NOW)).toMatchObject({ pending: 0 });
		const [, notice] = world.slack.of("chat.postMessage");
		expect(notice.args).toEqual({ channel: PERSON, text: pausedNotice({ pause_reason: "not_in_channel", title: "Weekly spend", channel_id: CHANNEL }), parse: "none" });
		expect(notice.args.text).toContain(`<#${CHANNEL}>`);
		expect(world.turns.created).toEqual([]);
	});

	it("counts any other failure to post as a failed run", async () => {
		world.slack.failures.set("chat.postMessage", ["ratelimited"]);
		expect(await startScheduledRun(world.deps, claimed())).toBe("failed");
		expect(rpcCalls("record_slack_agent_schedule_run").map((args) => [args.p_result, args.p_reason, args.p_pause])).toEqual([["failed", "slack_post_failed", false]]);
	});

	it("skips a run while the agent is paused or a bill is due, without pausing the schedule, posting or holding a meter place", async () => {
		await install({ status: "paused" });
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		await install({ status: "payment_due" });
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([
			{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "skipped", p_reason: "installation_paused", p_pause: false },
			{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "skipped", p_reason: "payment_due", p_pause: false },
		]);
		expect(world.slack.of("chat.postMessage")).toEqual([]);
		expect(meter().usage(NOW)).toMatchObject({ pending: 0 });
		expect(world.turns.created).toEqual([]);
	});

	it("skips a run the meter refuses because the agent is off here, without pausing the schedule", async () => {
		meter().uninstalled(NOW);
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "skipped", p_reason: "installation_paused", p_pause: false }]);
		expect(world.slack.of("chat.postMessage")).toEqual([]);
	});

	it("the cron tick claims due runs with one call and starts them; a failed claim does nothing", async () => {
		world.db.rpcResults.claim_slack_agent_schedules = [claimed(), claimed({ schedule_id: "00000000-0000-4000-8000-00000000e5c2", channel_id: "D0DIRECT01" })];
		expect(await runDueSchedules(world.deps)).toEqual({ claimed: 2, started: 2 });
		expect(rpcCalls("claim_slack_agent_schedules")).toEqual([{ p_limit: 50 }]);
		expect(world.turns.created.map((entry) => (entry.params as TurnRef).kind)).toEqual(["mention", "dm"]);
		// The installation is read once a tick.
		expect(world.db.queries.filter((query) => query.table === "slack_installations")).toHaveLength(1);
		world.db.failingRpcs.add("claim_slack_agent_schedules");
		await expect(runDueSchedules(world.deps)).resolves.toEqual({ claimed: 0, started: 0 });
	});

	it("runs as a normal answer from the creator: no question or schedule tools, the usual footer, one answer, the result recorded once", async () => {
		await startScheduledRun(world.deps, claimed());
		const turn = world.turns.created[0].params as TurnRef;
		const agent = new ScriptedAgent(async (hooks) => {
			await hooks.onText("Last week you spent $12.50.");
			await hooks.onStep({ costUsd: 0.01 });
			return { costUsd: 0.01, model: "openai/gpt-test", stopReason: null };
		});
		const step = new FakeStep();
		await expect(runTurn({ ...world.deps, agent }, turn, step)).resolves.toEqual({ status: "answered" });
		const [request] = agent.requests;
		expect(request.tools.map((tool) => tool.id)).not.toEqual(expect.arrayContaining(["ask_question"]));
		expect(request.tools.map((tool) => tool.id).filter((id) => /schedule/.test(id))).toEqual([]);
		expect(request.prompt).toContain(`A scheduled run of a recurring task <@${PERSON}> set up. Do it now:\nTask: Weekly <spend> & models`);
		expect(request.instructions).toContain("This is a scheduled run of a recurring task.");
		expect(request.instructions).not.toContain("ask_question");
		expect(request.maxCostUsd).toBe(0.5);
		expect(request.endUser).toBe(`slack:${TEAM_ID}:${PERSON}`);
		expect(request.sessionId).toBe(`slack-${turn.eventId}`);
		// Answered in the "Scheduled:" message's thread, with the usual footer.
		const stop = world.slack.of("chat.stopStream")[0];
		expect(world.slack.of("chat.startStream")[0].args).toMatchObject({ channel: CHANNEL, thread_ts: turn.threadTs, recipient_user_id: PERSON });
		expect(JSON.stringify(stop.args.blocks)).toContain(`session=slack-${turn.eventId}`);
		expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "answered", p_reason: null, p_pause: false }]);
	});

	it("never searches Slack, even where search is on and a token is in its turn", async () => {
		await install({ bot_scopes: [...ORIGINAL_BOT_SCOPES, "search:read.public", "search:read.files"], search_mode: "dm_and_channels" });
		await startScheduledRun(world.deps, claimed());
		const turn = world.turns.created[0].params as TurnRef;
		// Scheduled runs have no message and so no action token; one here is still never used.
		storageOf(world.threads.get(world.threads.idFromName(turn.threadKey))).sql.exec("UPDATE turns SET action_token = ?", "7310092.18.0c9f5a6d2e8bTOKEN");
		const agent = new ScriptedAgent(async (hooks) => {
			await hooks.onText("Last week you spent $12.50.");
			return { costUsd: 0.01, model: "openai/gpt-test", stopReason: null };
		});
		await expect(runTurn({ ...world.deps, agent }, turn, new FakeStep())).resolves.toEqual({ status: "answered" });
		const [request] = agent.requests;
		expect(request.tools.map((tool) => tool.id)).not.toContain("search_slack");
		expect(request.instructions).toContain("You can't search Slack messages in a scheduled run");
		expect(request.instructions).not.toContain("ask_question");
		expect(world.slack.of("assistant.search.context")).toEqual([]);
	});

	it("records a failed answer, and a turn that skips because the creator must now be linked", async () => {
		await startScheduledRun(world.deps, claimed());
		const turn = world.turns.created[0].params as TurnRef;
		const failing = new ScriptedAgent(async () => {
			throw new Error("boom");
		});
		await runTurn({ ...world.deps, agent: failing }, turn, new FakeStep());
		await install({ access_mode: "linked" });
		await runTurn({ ...world.deps, agent: failing }, { ...turn, turnId: 99 }, new FakeStep());
		expect(rpcCalls("record_slack_agent_schedule_run").map((args) => [args.p_result, args.p_reason, args.p_pause])).toEqual([
			["failed", "failed", false],
			["skipped", "creator_access", true],
		]);
	});

	it("records a turn skipped because the agent was paused or a bill fell due before it loaded, without pausing its schedule", async () => {
		await startScheduledRun(world.deps, claimed());
		const turn = world.turns.created[0].params as TurnRef;
		const agent = new ScriptedAgent(async () => {
			throw new Error("not run");
		});
		await install({ status: "paused" });
		await expect(runTurn({ ...world.deps, agent }, turn, new FakeStep())).resolves.toEqual({ status: "skipped" });
		await install({ status: "payment_due" });
		await expect(runTurn({ ...world.deps, agent }, { ...turn, turnId: 99 }, new FakeStep())).resolves.toEqual({ status: "skipped" });
		expect(agent.requests).toEqual([]);
		expect(rpcCalls("record_slack_agent_schedule_run").map((args) => [args.p_result, args.p_reason, args.p_pause])).toEqual([
			["skipped", "installation_paused", false],
			["skipped", "payment_due", false],
		]);
		// Nothing paused, so the creator isn't told anything.
		expect(world.slack.of("chat.postMessage").filter((call) => call.args.channel === PERSON)).toEqual([]);
	});

	it("tells the creator privately when the third failure pauses it", async () => {
		await startScheduledRun(world.deps, claimed());
		const turn = world.turns.created[0].params as TurnRef;
		world.db.rpcResults.record_slack_agent_schedule_run = { recorded: true, paused: true, pause_reason: "failures", created_by: PERSON, channel_id: CHANNEL, title: "Weekly spend" };
		await runTurn({ ...world.deps, agent: new ScriptedAgent(async () => { throw new Error("boom"); }) }, turn, new FakeStep());
		const notice = world.slack.of("chat.postMessage").find((call) => call.args.channel === PERSON);
		expect(notice?.args.text).toBe("I've paused your recurring task \"Weekly spend\" because its last 3 runs didn't go through. A Phaseo workspace owner or admin can resume it in Phaseo settings, or you can ask me to set it up again.");
	});

	it("records a run as failed when its thread can't start the Workflow, and gives the meter place back", async () => {
		world.turns.create = async () => {
			throw new Error("workflows_unavailable");
		};
		await startScheduledRun(world.deps, claimed());
		expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "failed", p_reason: "start_failed", p_pause: false }]);
		expect(meter().usage(NOW)).toMatchObject({ pending: 0 });
	});

	it("records a run as failed when its thread times it out", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			vi.setSystemTime(NOW);
			await startScheduledRun(world.deps, claimed());
			const turn = world.turns.created[0].params as TurnRef;
			vi.setSystemTime(NOW + TURN_TIMEOUT_MS);
			await world.threads.get(world.threads.idFromName(turn.threadKey)).alarm();
			expect(rpcCalls("record_slack_agent_schedule_run")).toEqual([{ p_schedule_id: SCHEDULE_ID, p_run_at: RUN_AT, p_result: "failed", p_reason: "timed_out", p_pause: false }]);
		} finally {
			vi.useRealTimers();
		}
	});

	it("retries the Workflow's finish step until the run is recorded", async () => {
		await startScheduledRun(world.deps, claimed());
		const turn = world.turns.created[0].params as TurnRef;
		failRpc("record_slack_agent_schedule_run", 1);
		const agent = new ScriptedAgent(async (hooks) => {
			await hooks.onText("Done.");
			return { costUsd: 0.01, model: "openai/gpt-test", stopReason: null };
		});
		await expect(runTurn({ ...world.deps, agent }, turn, new FakeStep())).resolves.toEqual({ status: "answered" });
		expect(rpcCalls("record_slack_agent_schedule_run").map((args) => args.p_result)).toEqual(["answered", "answered"]);
		// The retried step counts the answer once.
		expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		// A database that stays down fails the step after its retries, rather than finishing unrecorded.
		await startScheduledRun(world.deps, claimed({ run_at: "2026-10-27T10:00:00+00:00" }));
		failRpc("record_slack_agent_schedule_run", 10);
		await expect(runTurn({ ...world.deps, agent }, world.turns.created[1].params as TurnRef, new FakeStep())).rejects.toThrow(/database unavailable/);
		expect(rpcCalls("record_slack_agent_schedule_run")).toHaveLength(2 + 4);
	});

	it("tries a run the cron tick couldn't start a few times, then gives up without throwing", async () => {
		await install({ schedule_creators: "linked" });
		failRpc("record_slack_agent_schedule_run", 1);
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run")).toHaveLength(2);
		failRpc("record_slack_agent_schedule_run", 10);
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run")).toHaveLength(2 + 3);
	});
});

describe("normal turns", () => {
	it("offer schedule_task with instructions to confirm the next run; off or for another organisation, only listing and cancelling", async () => {
		const { buildInstructions } = await import("../src/workflow");
		const offered = { usageTools: false };
		expect(buildInstructions({ instructions: null, usage_data_mode: "off" }, offered, NOW, "workspace", false, undefined, "create")).toContain("its next run");
		expect(buildInstructions({ instructions: null, usage_data_mode: "off" }, offered, NOW, "workspace", false, undefined, "off")).toContain("turned recurring tasks off");
		expect(buildInstructions({ instructions: null, usage_data_mode: "off" }, offered, NOW, "conversation", true, undefined, "external")).toContain("can't set up recurring tasks here");
	});
});

describe("home tab", () => {
	const facts = (overrides: Partial<HomeFacts> = {}): HomeFacts => ({
		installation: { bot_user_id: "U0BOT00001", status: "active", access_mode: "everyone", usage_data_mode: "dm" },
		model: "Auto", choices: null, account: "member", connectUrl: null, answers: 3, settingsUrl: "https://phaseo.app/settings/slack",
		...overrides,
	});

	it("explains recurring tasks while they're on, and lists the viewer's own", () => {
		const home = homeView(facts({
			schedules: {
				enabled: true,
				mine: [
					{ title: "Weekly <spend>", channel_id: CHANNEL, status: "active", pause_reason: null, next_run_at: "2026-11-02T09:00:00Z", last_result: "answered", last_result_reason: null, frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null, timezone: "Europe/London" },
					{ title: "Daily", channel_id: "D0DIRECT01", status: "paused", pause_reason: "admin", next_run_at: "2026-11-02T09:00:00Z", last_result: null, last_result_reason: null, frequency: "daily", hour: 8, minute: 30, day_of_week: null, day_of_month: null, timezone: "UTC" },
				],
			},
		}));
		const view = JSON.stringify(home);
		// People's titles: Slack leaves @here and the like in them as text.
		const list = (home.blocks as Array<{ text?: { text: string; verbatim?: boolean } }>).find((block) => block.text?.text.startsWith("*Your recurring tasks*"));
		expect(list?.text?.verbatim).toBe(true);
		expect(view).toContain("*Recurring tasks:*");
		expect(view).toContain("*Your recurring tasks*");
		expect(view).toContain(`• *Weekly &lt;spend&gt;*, every Monday at 09:00 (Europe/London time) in <#${CHANNEL}>: next Mon, Nov 2, 2026, 09:00 (Europe/London)`);
		expect(view).toContain("• *Daily*, every day at 08:30 (UTC time) here in Messages: _paused by an admin_");
		const off = JSON.stringify(homeView(facts({ schedules: { enabled: false, mine: [] } })));
		expect(off).not.toContain("Recurring tasks");
		expect(JSON.stringify(homeView(facts()))).not.toContain("ecurring");
		expect(view).not.toContain("are skipped");
	});

	it("says a run was skipped while the agent was paused, and that they carry on once it's back on", () => {
		const mine: NonNullable<HomeFacts["schedules"]>["mine"] = [
			{ title: "Standup", channel_id: CHANNEL, status: "active", pause_reason: null, next_run_at: "2026-11-02T09:00:00Z", last_result: "skipped", last_result_reason: "installation_paused", frequency: "daily", hour: 9, minute: 0, day_of_week: null, day_of_month: null, timezone: "UTC" },
		];
		const back = JSON.stringify(homeView(facts({ schedules: { enabled: true, mine } })));
		expect(back).toContain(`• *Standup*, every day at 09:00 (UTC time) in <#${CHANNEL}>: next Mon, Nov 2, 2026, 09:00 (UTC); last run skipped: the agent was paused`);
		expect(back).not.toContain("are skipped");
		const paused = JSON.stringify(homeView(facts({ installation: { bot_user_id: "U0BOT00001", status: "payment_due", access_mode: "everyone", usage_data_mode: "dm" }, schedules: { enabled: true, mine } })));
		expect(paused).toContain("While the agent is paused their runs are skipped, and they carry on by themselves once it's back on.");
	});

	it("reads only the viewer's schedules", async () => {
		world.db.tables.slack_agent_schedules = [
			{ installation_id: INSTALLATION_ID, created_by: PERSON, title: "Mine", channel_id: CHANNEL, status: "active", pause_reason: null, next_run_at: "2026-11-02T09:00:00Z", frequency: "daily", hour: 9, minute: 0, day_of_week: null, day_of_month: null, timezone: "UTC" },
			{ installation_id: INSTALLATION_ID, created_by: "U0PERSON02", title: "Theirs", channel_id: CHANNEL, status: "active", pause_reason: null, next_run_at: "2026-11-02T09:00:00Z", frequency: "daily", hour: 9, minute: 0, day_of_week: null, day_of_month: null, timezone: "UTC" },
		];
		const installation = world.db.tables.slack_installations[0] as unknown as Installation;
		await publishHome({ env: world.env, db: world.db, slack: world.slack.client(BOT_TOKEN), installation, slackUserId: PERSON, answersThisMonth: async () => 0, now: NOW });
		const view = JSON.stringify(world.slack.of("views.publish")[0].args.view);
		expect(view).toContain("*Mine*");
		expect(view).not.toContain("Theirs");
	});
});
