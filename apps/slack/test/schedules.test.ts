import { beforeEach, describe, expect, it } from "vitest";
import type { AgentRunner, AgentTurnHooks, AgentTurnOutput, AgentTurnRequest } from "../src/agent";
import { clearUserFactsCache } from "../src/access";
import { homeView, publishHome, type HomeFacts } from "../src/home";
import type { Installation } from "../src/installations";
import { pausedNotice, runDueSchedules, scheduledEventId, startScheduledRun, type ClaimedRun } from "../src/scheduled-runs";
import { describeTiming, formatRunTime, scheduleMode, scheduleTools, timingInput, type ScheduleRow } from "../src/schedules";
import type { TurnRef } from "../src/turns";
import { runTurn, type StepConfig, type StepRunner } from "../src/workflow";
import { BOT_TOKEN, INSTALLATION_ID, installationRow, TEAM_ID, testWorld, type TestWorld } from "./fakes";

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
	const tools = (canCreate = true) => {
		const notes: string[] = [];
		const list = scheduleTools({ db: world.db, slack: world.slack.client(BOT_TOKEN), installationId: INSTALLATION_ID, channel: CHANNEL, slackUserId: PERSON, canCreate, notes });
		const byId = (id: string) => list.find((tool) => tool.id === id)!;
		return { list, notes, run: (id: string, input: Record<string, unknown> = {}) => (byId(id).execute as (input: unknown) => Promise<any>)(input) };
	};
	const savedRow = (overrides: Partial<ScheduleRow> = {}): ScheduleRow => ({
		id: SCHEDULE_ID, channel_id: CHANNEL, title: "Weekly spend", prompt: "Summarise it.", created_by: PERSON, status: "active", pause_reason: null,
		next_run_at: "2026-11-02T09:00:00+00:00", last_result: null, frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null, timezone: "Europe/London",
		...overrides,
	});

	it("schedule_task saves a self-contained prompt here, in the person's Slack time zone, and says when it runs next", async () => {
		world.db.rpcResults.save_slack_agent_schedule = { status: "saved", schedule: savedRow() };
		const { run, notes } = tools();
		const result = await run("schedule_task", { title: "  Weekly   spend ", prompt: "Summarise it.", frequency: "weekly", time: "09:00", day_of_week: "monday" });
		expect(rpcCalls("save_slack_agent_schedule")).toEqual([{
			p_installation_id: INSTALLATION_ID, p_channel_id: CHANNEL, p_title: "Weekly spend", p_prompt: "Summarise it.", p_frequency: "weekly",
			p_hour: 9, p_minute: 0, p_day_of_week: 1, p_day_of_month: null, p_timezone: "Europe/London", p_created_by: PERSON,
		}]);
		expect(world.slack.of("users.info").map((call) => call.args.user)).toEqual([PERSON]);
		expect(result).toEqual({
			saved: true, id: SCHEDULE_ID, title: "Weekly spend", runs: "every Monday at 09:00 (Europe/London time)", where: "this conversation",
			next_run: "Mon, Nov 2, 2026, 09:00 (Europe/London)",
		});
		expect(notes).toEqual(["schedule_task weekly"]);
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

	it("lists this conversation's and the person's own, and cancels by id", async () => {
		world.db.tables.slack_agent_schedules = [
			{ ...savedRow(), installation_id: INSTALLATION_ID, created_at: "2026-10-20T09:00:00Z" },
			{ ...savedRow({ id: "00000000-0000-4000-8000-00000000e5c2", channel_id: "C0OTHER001", status: "paused", pause_reason: "failures", last_result: "failed" }), installation_id: INSTALLATION_ID, created_at: "2026-10-21T09:00:00Z" },
		];
		const { run, notes } = tools();
		const { schedules } = await run("list_schedules");
		expect(world.db.queries.at(-1)?.query).toMatchObject({ installation_id: `eq.${INSTALLATION_ID}`, or: `(channel_id.eq.${CHANNEL},created_by.eq.${PERSON})` });
		expect(schedules).toEqual([
			{ id: SCHEDULE_ID, title: "Weekly spend", prompt: "Summarise it.", runs: "every Monday at 09:00 (Europe/London time)", where: "this conversation", status: "active", next_run: "Mon, Nov 2, 2026, 09:00 (Europe/London)", set_up_by: `<@${PERSON}>` },
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
			text: "Scheduled: Weekly <spend> & models",
			blocks: [
				{ type: "section", text: { type: "mrkdwn", text: "*Scheduled:* Weekly &lt;spend&gt; &amp; models" } },
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
		expect(notice.args).toEqual({ channel: PERSON, text: pausedNotice({ pause_reason: "not_in_channel", title: "Weekly spend", channel_id: CHANNEL }) });
		expect(notice.args.text).toContain(`<#${CHANNEL}>`);
		expect(world.turns.created).toEqual([]);
	});

	it("counts any other failure to post as a failed run, and pauses a schedule of a paused installation", async () => {
		world.slack.failures.set("chat.postMessage", ["ratelimited"]);
		expect(await startScheduledRun(world.deps, claimed())).toBe("failed");
		await install({ status: "paused" });
		expect(await startScheduledRun(world.deps, claimed())).toBe("skipped");
		expect(rpcCalls("record_slack_agent_schedule_run").map((args) => [args.p_result, args.p_reason, args.p_pause])).toEqual([
			["failed", "slack_post_failed", false],
			["skipped", "installation_paused", true],
		]);
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

	it("tells the creator privately when the third failure pauses it", async () => {
		await startScheduledRun(world.deps, claimed());
		const turn = world.turns.created[0].params as TurnRef;
		world.db.rpcResults.record_slack_agent_schedule_run = { recorded: true, paused: true, pause_reason: "failures", created_by: PERSON, channel_id: CHANNEL, title: "Weekly spend" };
		await runTurn({ ...world.deps, agent: new ScriptedAgent(async () => { throw new Error("boom"); }) }, turn, new FakeStep());
		const notice = world.slack.of("chat.postMessage").find((call) => call.args.channel === PERSON);
		expect(notice?.args.text).toBe("I've paused your recurring task \"Weekly spend\" because its last 3 runs didn't go through. A Phaseo workspace owner or admin can resume it in Phaseo settings, or you can ask me to set it up again.");
	});
});

describe("normal turns", () => {
	it("offer schedule_task with instructions to confirm the next run; off or for another organisation, only listing and cancelling", async () => {
		const { buildInstructions } = await import("../src/workflow");
		const offered = { usageTools: false };
		expect(buildInstructions({ instructions: null, usage_data_mode: "off" }, offered, NOW, "workspace", false, "create")).toContain("its next run");
		expect(buildInstructions({ instructions: null, usage_data_mode: "off" }, offered, NOW, "workspace", false, "off")).toContain("turned recurring tasks off");
		expect(buildInstructions({ instructions: null, usage_data_mode: "off" }, offered, NOW, "conversation", true, "external")).toContain("can't set up recurring tasks here");
	});
});

describe("home tab", () => {
	const facts = (overrides: Partial<HomeFacts> = {}): HomeFacts => ({
		installation: { bot_user_id: "U0BOT00001", status: "active", access_mode: "everyone", usage_data_mode: "dm" },
		model: "Auto", choices: null, account: "member", connectUrl: null, answers: 3, settingsUrl: "https://phaseo.app/settings/slack",
		...overrides,
	});

	it("explains recurring tasks while they're on, and lists the viewer's own", () => {
		const view = JSON.stringify(homeView(facts({
			schedules: {
				enabled: true,
				mine: [
					{ title: "Weekly <spend>", channel_id: CHANNEL, status: "active", pause_reason: null, next_run_at: "2026-11-02T09:00:00Z", frequency: "weekly", hour: 9, minute: 0, day_of_week: 1, day_of_month: null, timezone: "Europe/London" },
					{ title: "Daily", channel_id: "D0DIRECT01", status: "paused", pause_reason: "admin", next_run_at: "2026-11-02T09:00:00Z", frequency: "daily", hour: 8, minute: 30, day_of_week: null, day_of_month: null, timezone: "UTC" },
				],
			},
		})));
		expect(view).toContain("*Recurring tasks:*");
		expect(view).toContain("*Your recurring tasks*");
		expect(view).toContain(`• *Weekly &lt;spend&gt;*, every Monday at 09:00 (Europe/London time) in <#${CHANNEL}>: next Mon, Nov 2, 2026, 09:00 (Europe/London)`);
		expect(view).toContain("• *Daily*, every day at 08:30 (UTC time) here in Messages: _paused by an admin_");
		const off = JSON.stringify(homeView(facts({ schedules: { enabled: false, mine: [] } })));
		expect(off).not.toContain("Recurring tasks");
		expect(JSON.stringify(homeView(facts()))).not.toContain("ecurring");
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
