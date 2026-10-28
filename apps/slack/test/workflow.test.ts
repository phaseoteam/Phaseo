import { AgentGatewayError } from "@phaseo/agent-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunner, AgentTurnHooks, AgentTurnOutput, AgentTurnRequest, AskOutput, AskRequest, GeneratedImage, ImageRequest, PausedRun } from "../src/agent";
import { clearUserFactsCache } from "../src/access";
import { SEARCHED_REPLY_MEMORY, TURN_TIMEOUT_MS, type TurnRequest } from "../src/coordinator";
import { processEvent, type SlackEnvelope } from "../src/events";
import { hostedApp, ORIGINAL_BOT_SCOPES, type Installation } from "../src/installations";
import { handleInteraction } from "../src/interactions";
import { answerValue } from "../src/questions";
import type { TurnRef } from "../src/turns";
import { MEMORY_TOOL_IDS, SKILL_TOOL_IDS } from "../src/memory";
import { SCHEDULE_TOOL_IDS } from "../src/schedules";
import { footerModels, runTurn, type StepConfig, type StepRunner, type TurnDeps } from "../src/workflow";
import {
	BOT_TOKEN, BOT_USER_ID, COMPANY_APP_ID, COMPANY_APP_ROW_ID, eventEnvelope, HOSTED_APP_ID, INSTALLATION_ID, installationRow, mention, storageOf, TEAM_ID, testWorld, WORKSPACE_ID,
	type SlackCall, type TestWorld,
} from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const GATEWAY_KEY = "phaseo_v1_sk_testkid00000_testsecret";
const USER = "00000000-0000-4000-8000-0000000000d1";

/** Runs steps like Workflows does: retries up to the step's limit, and keeps outputs as JSON. */
class FakeStep implements StepRunner {
	outputs: Array<{ name: string; attempt: number; output: unknown }> = [];
	failures: Array<{ name: string; attempt: number }> = [];
	waits: Array<{ name: string; type: string; timeout: string | number }> = [];
	/** What happens while a turn waits for an event: by default nothing, and the wait times out. */
	onWait: ((name: string) => Promise<"event" | "timeout">) | null = null;

	async waitForEvent(name: string, options: { type: string; timeout: string | number }): Promise<unknown> {
		this.waits.push({ name, ...options });
		if ((this.onWait ? await this.onWait(name) : "timeout") === "timeout") throw new Error(`waitForEvent ${name} timed out`);
		return { type: options.type, payload: {}, timestamp: new Date(0) };
	}

	async do<T>(name: string, config: StepConfig, callback: (context: { attempt: number }) => Promise<T>): Promise<T> {
		for (let attempt = 1; ; attempt += 1) {
			try {
				const output = JSON.parse(JSON.stringify((await callback({ attempt })) ?? null)) as T;
				this.outputs.push({ name, attempt, output });
				return output;
			} catch (error) {
				this.failures.push({ name, attempt });
				if (attempt > (config.retries?.limit ?? 0)) throw error;
			}
		}
	}
}

type Script = (request: AgentTurnRequest, hooks: AgentTurnHooks, call: number) => Promise<AgentTurnOutput>;
type AskScript = (request: AskRequest, call: number) => Promise<AskOutput>;

class ScriptedAgent implements AgentRunner {
	requests: AgentTurnRequest[] = [];
	asks: AskRequest[] = [];
	constructor(private readonly script: Script, private readonly askScript: AskScript = async () => { throw new Error("unexpected ask"); }) {}
	async run(request: AgentTurnRequest, hooks: AgentTurnHooks) {
		this.requests.push(request);
		return this.script(request, hooks, this.requests.length);
	}
	async ask(request: AskRequest) {
		this.asks.push(request);
		return this.askScript(request, this.asks.length);
	}
}

const answer = (model = "openai/gpt-test", costUsd = 0.0123): AgentTurnOutput => ({ costUsd, model, stopReason: null });

const GPT_PAGE = "https://phaseo.app/models/openai/gpt-test";

/** The footer's link to a turn's requests in Logs: its session, from the day before to the day after NOW. */
function logsUrl(turn: Pick<TurnRef, "eventId">): string {
	return `https://phaseo.app/settings/usage/logs/requests?workspaceId=${WORKSPACE_ID}&session=slack-${turn.eventId}&usage_preset=custom&usage_from=2026-10-20&usage_to=2026-10-22`;
}

/** The footer in a context block (mrkdwn) and in a whole message (italic markdown); Auto → GPT Test unless given. */
function mrkdwnFooter(turn: Pick<TurnRef, "eventId">, cost: string, model = `Auto → <${GPT_PAGE}|GPT Test>`): string {
	return `${model} · <${logsUrl(turn)}|${cost}>`;
}
function markdownFooter(turn: Pick<TurnRef, "eventId">, cost: string, model = `Auto → [GPT Test](${GPT_PAGE})`): string {
	return `_${model} · [${cost}](${logsUrl(turn)})_`;
}

let world: TestWorld;
let step: FakeStep;
let counter = 0;

async function install(overrides: Partial<Installation> = {}) {
	world.db.tables.slack_installations = [await installationRow(overrides)];
}

/** Queues a turn the way the Worker does (meter place, then the coordinator), and returns what the Workflow gets. */
async function startTurn(overrides: Partial<TurnRequest> = {}): Promise<TurnRef> {
	counter += 1;
	const channel = overrides.channel ?? "C0CHANNEL1";
	const messageTs = overrides.messageTs ?? `1792600000.00${String(counter).padStart(4, "0")}`;
	const threadTs = overrides.threadTs ?? messageTs;
	const installationId = overrides.installationId ?? INSTALLATION_ID;
	const threadKey = `${installationId}:${channel}:${threadTs}`;
	const coordinator = world.threads.get(world.threads.idFromName(threadKey));
	let started: TurnRef | null = null;
	coordinator.runner = { start: async (turn) => { started = turn; return { started: true }; } };
	const eventId = `Ev0WF${String(counter).padStart(4, "0")}`;
	world.meters.get(world.meters.idFromName(installationId)).admit({
		settings: { id: installationId, workspace_id: WORKSPACE_ID, status: "active", plan_people: 100, over_plan: "refuse", max_people: null, monthly_cap_nanos: 100_000_000_000, answers_per_person_hour: 60, allow_guests: true, allow_external_users: false },
		slackUserId: overrides.slackUserId ?? "U0PERSON01",
		facts: { isBot: false, isExternal: false, isGuest: false },
		eventId,
		now: NOW,
	});
	await coordinator.enqueue({
		threadKey, eventId, installationId, teamId: TEAM_ID, channel, threadTs, messageTs,
		slackUserId: "U0PERSON01", kind: channel.startsWith("D") ? "dm" : "mention", text: `<@${BOT_USER_ID}> what did we spend this week?`,
		...overrides,
	}, NOW);
	if (!started) throw new Error("turn did not start");
	return started;
}

function coordinatorOf(turn: TurnRef) {
	return world.threads.get(world.threads.idFromName(turn.threadKey));
}

function meter() {
	return world.meters.get(world.meters.idFromName(INSTALLATION_ID));
}

function deps(agent: AgentRunner): TurnDeps {
	return { ...world.deps, agent };
}

/** The tools a turn was offered besides memory and skills, which every turn gets (memory.test.ts). */
function offeredTools(request: AgentTurnRequest): string[] {
	return request.tools.map((tool) => tool.id).filter((id) => id !== "ask_question" && !(MEMORY_TOOL_IDS as readonly string[]).includes(id) && !(SCHEDULE_TOOL_IDS as readonly string[]).includes(id));
}

beforeEach(async () => {
	world = testWorld({ now: NOW });
	step = new FakeStep();
	clearUserFactsCache();
	await install();
	world.db.tables.v2_models.push(
		{ model_slug: "openai/gpt-test", name: "GPT Test", hidden: false },
		{ model_slug: "anthropic/claude-test", name: "Claude Test", hidden: false },
	);
});

describe("AgentTurnWorkflow", () => {
	it("answers: thinking status, a batched stream, a footer, one counted answer, and ids-only step outputs", async () => {
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("You spent ");
			world.clock.now += 500;
			await hooks.onText("$12.50 this week.");
			await hooks.onStep({ costUsd: 0.0123 });
			return answer();
		});
		const turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });

		expect(world.slack.calls.map((call) => [call.method, call.args])).toEqual([
			["agents.sessions.setStatus", { channel_id: "C0CHANNEL1", thread_ts: turn.threadTs, status: "processing" }],
			["chat.startStream", { channel: "C0CHANNEL1", thread_ts: turn.threadTs, markdown_text: "You spent ", recipient_user_id: "U0PERSON01", recipient_team_id: TEAM_ID }],
			["chat.appendStream", { channel: "C0CHANNEL1", ts: "1792600100.000001", markdown_text: "$12.50 this week." }],
			["chat.stopStream", { channel: "C0CHANNEL1", ts: "1792600100.000001", blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0123") }] }] }],
		]);
		expect(new Set(world.slack.calls.map((call) => call.token))).toEqual(new Set([BOT_TOKEN]));
		expect(meter().usage(NOW)).toMatchObject({ people: 1, answers: 1, pending: 0 });
		expect(coordinatorOf(turn).status()).toMatchObject({ running: null, queued: 0 });
		expect(coordinatorOf(turn).workingMemory()).toEqual([{ kind: "reply", text: "You spent $12.50 this week.", at: world.clock.now, ts: "1792600100.000001" }]);
		// A new thread: its message and the reply are the messages the next read starts from.
		expect(coordinatorOf(turn).knownMessages()).toEqual([turn.messageTs, "1792600100.000001"]);

		// Step outputs are kept with the instance: ids and statuses only.
		expect(step.outputs.map((entry) => entry.name)).toEqual(["load", "context", "run", "reply", "finish"]);
		const stored = JSON.stringify(step.outputs);
		for (const secretOrText of ["spent", "what did we", GATEWAY_KEY, BOT_TOKEN]) expect(stored).not.toContain(secretOrText);
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toEqual({ status: "answered", ts: "1792600100.000001", streamed: true, explained: true, costNanos: 12_300_000, requestedModel: "phaseo/auto", model: "openai/gpt-test", error: null, consulted: [], consultCount: 0 });
		expect(step.outputs.find((entry) => entry.name === "reply")?.output).toEqual({ shown: true, stopped: true });

		const [request] = agent.requests;
		expect(request).toMatchObject({
			gatewayKey: GATEWAY_KEY,
			model: "phaseo/auto",
			endUser: `slack:${TEAM_ID}:U0PERSON01`,
			labels: { slackTeam: TEAM_ID, slackChannel: "C0CHANNEL1" },
		});
		// No usage tools here; memory, skills and questions always.
		expect(request.tools.map((tool) => tool.id)).toEqual([...MEMORY_TOOL_IDS, ...SCHEDULE_TOOL_IDS, "ask_question"]);
		expect(request.resume).toBeUndefined();
		expect(request.prompt).toBe("New message from <@U0PERSON01>:\nwhat did we spend this week?");
		expect(request.instructions).toContain("can't see this workspace's Phaseo usage");
	});

	it("names models in the footer by their catalogue names, and only adds the one Auto picked", async () => {
		const claude = { name: "Claude Test", slug: "anthropic/claude-test" };
		const auto = { name: "Auto", slug: null };
		// A chosen model: its own name, even when the response names the provider's id for it.
		await expect(footerModels(world.db, "anthropic/claude-test", "claude-test-2026-10")).resolves.toEqual({ model: claude, answeredBy: null });
		await expect(footerModels(world.db, "anthropic/claude-test", "anthropic/claude-test")).resolves.toEqual({ model: claude, answeredBy: null });
		// Not in the catalogue: its id, with no page to link to.
		await expect(footerModels(world.db, "acme/unlisted", null)).resolves.toEqual({ model: { name: "acme/unlisted", slug: null }, answeredBy: null });
		// Hidden from the catalogue: its name, but no page.
		world.db.tables.v2_models.push({ model_slug: "acme/hidden", name: "Hidden Test", hidden: true });
		await expect(footerModels(world.db, "acme/hidden", null)).resolves.toEqual({ model: { name: "Hidden Test", slug: null }, answeredBy: null });
		// Auto: the model it picked, only when that is a catalogue model. Auto itself has no page.
		await expect(footerModels(world.db, "phaseo/auto", "openai/gpt-test")).resolves.toEqual({ model: auto, answeredBy: { name: "GPT Test", slug: "openai/gpt-test" } });
		await expect(footerModels(world.db, "phaseo/auto", "gpt-test")).resolves.toEqual({ model: auto, answeredBy: null });
		await expect(footerModels(world.db, "phaseo/auto", null)).resolves.toEqual({ model: auto, answeredBy: null });
		// The catalogue can't be read: ids, never an error.
		world.db.select = async () => { throw new Error("db_error_503"); };
		await expect(footerModels(world.db, "anthropic/claude-test", null)).resolves.toEqual({ model: { name: "anthropic/claude-test", slug: null }, answeredBy: null });
	});

	it("shows the chosen model's name in the footer when the response reports the provider's id", async () => {
		await install({ model: "anthropic/claude-test" });
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("Bonjour.");
			await hooks.onStep({ costUsd: 0.0123 });
			return answer("claude-test-2026-10");
		});
		const turn = await startTurn();
		await runTurn(deps(agent), turn, step);
		expect(world.slack.of("chat.stopStream")[0].args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0123", "<https://phaseo.app/models/anthropic/claude-test|Claude Test>") }] }]);
	});

	it("passes the admins' instructions and model", async () => {
		await install({ model: "anthropic/claude-test", instructions: "Answer in French." });
		const agent = new ScriptedAgent(async () => answer("anthropic/claude-test"));
		await runTurn(deps(agent), await startTurn(), step);
		expect(agent.requests[0].model).toBe("anthropic/claude-test");
		expect(agent.requests[0].instructions).toMatch(/Instructions from this workspace's admins:\nAnswer in French\.$/);
	});

	it("puts the conversation's pins and the saved skills before the conversation, and answers without them when they can't be read", async () => {
		world.db.rpcResults.load_slack_agent_turn_memory = {
			pins: [{ id: "00000000-0000-4000-8000-0000000000e1", scope: "workspace", text: "Our fiscal year starts on 1 April.", created_at: "2026-10-20T09:00:00Z" }],
			skills: [{ name: "Weekly report", description: "Summarise the week." }],
			skills_total: 1,
		};
		const agent = new ScriptedAgent(async () => answer());
		await runTurn(deps(agent), await startTurn(), step);
		expect(world.db.rpcs.find((call) => call.fn === "load_slack_agent_turn_memory")?.args).toEqual({ p_installation_id: INSTALLATION_ID, p_channel_id: "C0CHANNEL1", p_workspace_notes: true });
		expect(agent.requests[0].prompt).toBe([
			"Pinned for the whole Slack workspace, newest first:",
			"- Our fiscal year starts on 1 April. (id 00000000-0000-4000-8000-0000000000e1)",
			"",
			"Saved skills (call use_skill to load one):",
			"- Weekly report: Summarise the week.",
			"",
			"New message from <@U0PERSON01>:",
			"what did we spend this week?",
		].join("\n"));
		expect(agent.requests[0].instructions).toContain("Save one with remember only when someone asks you to remember");
		expect(agent.requests[0].instructions).toContain("Call save_skill only when someone explicitly asks you to save a skill.");

		world.db.failingRpcs.add("load_slack_agent_turn_memory");
		await runTurn(deps(agent), await startTurn(), step);
		expect(agent.requests[1].prompt).toBe("New message from <@U0PERSON01>:\nwhat did we spend this week?");
		expect(agent.requests[1].tools.map((tool) => tool.id)).toEqual([...MEMORY_TOOL_IDS, ...SCHEDULE_TOOL_IDS, "ask_question"]);
	});

	it("shows someone from another organisation only this conversation's notes, and lets them use skills but not save them", async () => {
		world.db.rpcResults.load_slack_agent_turn_memory = {
			pins: [
				{ id: "00000000-0000-4000-8000-0000000000e1", scope: "channel", text: "Release notes go out on Tuesdays.", created_at: "2026-10-20T09:00:00Z" },
				{ id: "00000000-0000-4000-8000-0000000000e2", scope: "workspace", text: "Our fiscal year starts on 1 April.", created_at: "2026-10-20T09:00:00Z" },
			],
			skills: [{ name: "Weekly report", description: "Summarise the week." }],
			skills_total: 1,
		};
		const agent = new ScriptedAgent(async () => answer());
		const turn = await startTurn({ external: true });
		// The coordinator keeps the flag for the Workflow.
		expect(turn.external).toBe(true);
		await runTurn(deps(agent), turn, step);
		expect(world.db.rpcs.find((call) => call.fn === "load_slack_agent_turn_memory")?.args).toMatchObject({ p_workspace_notes: false });
		const [request] = agent.requests;
		expect(request.prompt).toContain("Release notes go out on Tuesdays.");
		expect(request.prompt).not.toContain("fiscal year");
		expect(request.prompt).toContain("- Weekly report: Summarise the week.");
		expect(request.instructions).toContain("The person asking is from another organisation");
		// Skills apply to the whole workspace: they can use them, not save them.
		expect(request.tools.map((tool) => tool.id)).toEqual([...MEMORY_TOOL_IDS.filter((id) => id !== "save_skill"), "list_schedules", "cancel_schedule", "ask_question"]);
		expect(request.instructions).toContain("they can't save skills");
		expect((request.tools.find((tool) => tool.id === "remember")!.parameters as any).properties.scope.enum).toEqual(["conversation"]);

		// Someone from this organisation in the same thread sees the workspace's too.
		await runTurn(deps(agent), await startTurn(), step);
		expect(agent.requests[1].prompt).toContain("fiscal year");
	});

	it("with memory off: no note tools and no pins, but the skills and their tools", async () => {
		await install({ memory_enabled: false });
		world.db.rpcResults.load_slack_agent_turn_memory = {
			pins: [{ id: "00000000-0000-4000-8000-0000000000e1", scope: "channel", text: "Release notes go out on Tuesdays.", created_at: "2026-10-20T09:00:00Z" }],
			skills: [{ name: "Weekly report", description: "Summarise the week." }],
			skills_total: 1,
		};
		const agent = new ScriptedAgent(async () => answer());
		await runTurn(deps(agent), await startTurn(), step);
		const [request] = agent.requests;
		expect(request.tools.map((tool) => tool.id)).toEqual([...SKILL_TOOL_IDS, ...SCHEDULE_TOOL_IDS, "ask_question"]);
		expect(request.prompt).toBe([
			"Saved skills (call use_skill to load one):",
			"- Weekly report: Summarise the week.",
			"",
			"New message from <@U0PERSON01>:",
			"what did we spend this week?",
		].join("\n"));
		expect(request.instructions).toContain("turned your memory (notes, pins and to-dos) off");
		expect(request.instructions).not.toContain("Save one with remember");
		expect(request.instructions).toContain("Call save_skill only when someone explicitly asks you to save a skill.");
	});

	it("offers usage tools only where usage_data_mode allows and to a linked member", async () => {
		const agent = new ScriptedAgent(async () => answer());
		const toolIds = () => offeredTools(agent.requests.at(-1)!);
		// A DM from someone who hasn't linked their account: only the Connect button.
		await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
		expect(toolIds()).toEqual(["connect_phaseo_account"]);
		// Linked, but no longer a member of the workspace.
		world.db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: USER });
		await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
		expect(toolIds()).toEqual([]);
		// A linked member, in a DM.
		world.db.tables.workspace_members.push({ workspace_id: WORKSPACE_ID, user_id: USER });
		await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
		expect(toolIds()).toEqual(["get_spend", "get_credit_balance", "get_key_usage", "find_models"]);
		expect(agent.requests.at(-1)!.tools.slice(4).map((tool) => tool.id)).toEqual([...MEMORY_TOOL_IDS, ...SCHEDULE_TOOL_IDS, "ask_question"]);
		expect(agent.requests.at(-1)!.instructions).toContain("You can look up this Phaseo workspace's spend");
		// The same member in a channel: only with dm_and_channels and the channel listed.
		await runTurn(deps(agent), await startTurn({ channel: "C0FINANCE1" }), step);
		expect(toolIds()).toEqual([]);
		await install({ usage_data_mode: "dm_and_channels", usage_data_channel_ids: ["C0FINANCE1"] });
		await runTurn(deps(agent), await startTurn({ channel: "C0FINANCE1" }), step);
		expect(toolIds()).toHaveLength(4);
		await install({ usage_data_mode: "off" });
		await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
		expect(toolIds()).toEqual([]);
		expect(agent.requests.at(-1)!.instructions).toContain("an admin has turned that off");
	});

	it("reads the thread's history, and falls back to working memory when Slack rate limits it", async () => {
		const agent = new ScriptedAgent(async (_request, hooks, call) => {
			await hooks.onText(call === 1 ? "Spend was $40.00." : "Still $40.00.");
			return answer();
		});
		const threadTs = "1792600000.000050";
		world.slack.replies = [
			{ ts: threadTs, user: "U0PERSON02", text: `<@${BOT_USER_ID}> how much last week?` },
			{ ts: "1792600000.000060", bot_id: "B0BOT00001", user: BOT_USER_ID, text: "Last week was $30.00." },
			{ ts: "1792600000.000070", user: "U0PERSON01", text: "and this week?" },
		];
		const first = await startTurn({ threadTs, messageTs: "1792600000.000070", text: "and this week?" });
		await runTurn(deps(agent), first, step);
		// A young thread is read from its first message, up to the one answered.
		expect(world.slack.of("conversations.replies")[0].args).toEqual({ channel: "C0CHANNEL1", ts: threadTs, oldest: threadTs, latest: "1792600000.000070", inclusive: true, limit: 15 });
		expect(agent.requests[0].prompt).toBe([
			"Earlier messages in this Slack thread, oldest first:",
			"<@U0PERSON02>: how much last week?",
			"You (Phaseo agent): Last week was $30.00.",
			"",
			"New message from <@U0PERSON01>:",
			"and this week?",
		].join("\n"));
		expect(step.outputs.find((entry) => entry.name === "context")?.output).toEqual({ source: "replies", messages: 2 });
		expect(coordinatorOf(first).knownMessages()).toEqual([threadTs, "1792600000.000060", "1792600000.000070", "1792600100.000001"]);

		// Rate limited: the agent's own earlier replies, and it knows it couldn't read the thread.
		world.slack.failures.set("conversations.replies", ["ratelimited"]);
		const second = await startTurn({ threadTs, messageTs: "1792600000.000080", text: "thanks, and now?" });
		await runTurn(deps(agent), second, step);
		expect(agent.requests[1].prompt).toBe([
			"Your earlier replies and lookups in this thread, oldest first:",
			"You (Phaseo agent): Spend was $40.00.",
			"",
			"(You couldn't read this Slack thread's messages just now, so only your own earlier replies are shown.)",
			"",
			"New message from <@U0PERSON01>:",
			"thanks, and now?",
		].join("\n"));
		expect(step.outputs.filter((entry) => entry.name === "context").at(-1)?.output).toEqual({ source: "memory", messages: 0 });
		// What came between is unknown now, so the next read starts at this message; replies after it stay known.
		expect(coordinatorOf(second).knownMessages()).toEqual(["1792600000.000080", "1792600100.000001", "1792600100.000002"]);
	});

	it("labels other bots and apps in the thread as such: only its own bot user or app is the agent", async () => {
		const agent = new ScriptedAgent(async () => answer());
		const question = `<@${BOT_USER_ID}> what did the deploy cost?`;
		world.slack.replies = [
			{ ts: "1792600000.000050", user: "U0PERSON02", text: `<@${BOT_USER_ID}> did the deploy go out?` },
			{ ts: "1792600000.000060", user: BOT_USER_ID, bot_id: "B0BOT00001", app_id: HOSTED_APP_ID, text: "I can't see deploys, but I can check spend." },
			{ ts: "1792600000.000065", user: "U0OTHERBOT", bot_id: "B0OTHER001", app_id: "A0OTHER001", bot_profile: { app_id: "A0OTHER001", name: "Deploy Bot" }, text: "Deploy 42 finished." },
			{ ts: "1792600000.000068", subtype: "bot_message", bot_id: "B0HOOK0001", text: "Build passed." },
			{ ts: "1792600000.000069", bot_id: "B0COMPANY1", app_id: COMPANY_APP_ID, bot_profile: { app_id: COMPANY_APP_ID, name: "Acme Agent" }, text: "Posted by the company's own app." },
			{ ts: "1792600000.000070", user: "U0PERSON01", text: question },
		];
		const prompt = (companyAppLine: string) => [
			"Earlier messages in this Slack thread, oldest first:",
			"<@U0PERSON02>: did the deploy go out?",
			"You (Phaseo agent): I can't see deploys, but I can check spend.",
			"Another app (Deploy Bot): Deploy 42 finished.",
			"Another app: Build passed.",
			companyAppLine,
			"",
			"New message from <@U0PERSON01>:",
			"what did the deploy cost?",
		].join("\n");
		await runTurn(deps(agent), await startTurn({ threadTs: "1792600000.000050", messageTs: "1792600000.000070", text: question }), step);
		expect(agent.requests[0].prompt).toBe(prompt("Another app (Acme Agent): Posted by the company's own app."));

		// Installed with the company's own app, that app's posts are the agent's, even without its bot user.
		await install({ slack_app_id: COMPANY_APP_ROW_ID });
		world.db.tables.slack_apps = [{ id: COMPANY_APP_ROW_ID, slack_app_id: COMPANY_APP_ID }];
		await runTurn(deps(agent), await startTurn({ threadTs: "1792600000.000040", messageTs: "1792600000.000070", text: question }), step);
		expect(agent.requests[1].prompt).toBe(prompt("You (Phaseo agent): Posted by the company's own app."));
	});

	describe("Slack's Retry-After for thread reads", () => {
		const OTHER_INSTALLATION_ID = "00000000-0000-4000-8000-0000000000a2";
		const COULDNT_READ = "(You couldn't read this Slack thread's messages just now";
		const reads = () => world.slack.of("conversations.replies").length;
		let threads = 0;
		/** A follow-up in a new thread (not its first message, so the turn reads the thread). */
		function followUp(overrides: Partial<TurnRequest> = {}) {
			threads += 1;
			return startTurn({ threadTs: `${1_792_600_000 + threads}.000100`, messageTs: `${1_792_600_000 + threads}.000200`, ...overrides });
		}

		it("a 429 in one thread pauses reads in the installation's other threads until Retry-After, but not another installation's", async () => {
			world.db.tables.slack_installations.push(await installationRow({ id: OTHER_INSTALLATION_ID, team_id: "T0TEST0002", bot_user_id: "U0BOT00002" }));
			const agent = new ScriptedAgent(async () => answer());
			world.slack.failures.set("conversations.replies", ["ratelimited:30"]);
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(1);
			expect(agent.requests[0].prompt).toContain(COULDNT_READ);

			// Another thread of the same installation doesn't ask Slack, and says it couldn't read.
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(1);
			expect(agent.requests[1].prompt).toContain(COULDNT_READ);
			expect(step.outputs.filter((entry) => entry.name === "context").at(-1)?.output).toEqual({ source: "memory", messages: 0 });

			// Another installation (another Slack workspace) reads as usual.
			await runTurn(deps(agent), await followUp({ installationId: OTHER_INSTALLATION_ID }), step);
			expect(reads()).toBe(2);
			expect(agent.requests[2].prompt).not.toContain(COULDNT_READ);

			// Reads start again once Retry-After has passed.
			world.clock.now = NOW + 29_999;
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(2);
			world.clock.now = NOW + 30_000;
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(3);
			expect(agent.requests.at(-1)!.prompt).not.toContain(COULDNT_READ);
		});

		it("doesn't space reads otherwise, for the hosted app or a company's own app, and a company app honours a 429 too", async () => {
			const agent = new ScriptedAgent(async () => answer());
			await runTurn(deps(agent), await followUp(), step);
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(2);

			await install({ slack_app_id: COMPANY_APP_ROW_ID });
			world.db.tables.slack_apps = [{ id: COMPANY_APP_ROW_ID, slack_app_id: COMPANY_APP_ID }];
			await runTurn(deps(agent), await followUp(), step);
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(4);

			world.slack.failures.set("conversations.replies", ["ratelimited"]);
			await runTurn(deps(agent), await followUp(), step);
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(5);
			world.clock.now = NOW + 60_000;
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(6);
			expect(agent.requests.map((request) => request.prompt.includes(COULDNT_READ))).toEqual([false, false, false, false, true, true, false]);
		});

		it("still reads when the meter can't say whether reads are paused", async () => {
			const agent = new ScriptedAgent(async () => answer());
			meter().historyReadsPausedUntil = () => {
				throw new Error("meter_unavailable");
			};
			await runTurn(deps(agent), await followUp(), step);
			expect(reads()).toBe(1);
			expect(agent.requests[0].prompt).not.toContain(COULDNT_READ);
		});
	});

	describe("a 40-message thread", () => {
		const START = 1_792_599_215;
		/** Message i, `gap` seconds apart, from U0PERSON03 (even) and U0PERSON02 (odd); the `mentions` are U0PERSON01's, to the agent. */
		function thread(gapSeconds: number, mentions: number[]) {
			return Array.from({ length: 40 }, (_, index) => {
				const mentioned = mentions.includes(index);
				return {
					ts: `${START + index * gapSeconds}.000100`,
					user: mentioned ? "U0PERSON01" : index % 2 ? "U0PERSON02" : "U0PERSON03",
					text: mentioned ? `<@${BOT_USER_ID}> message ${index}: what do you make of this?` : `message ${index}`,
				};
			});
		}

		function turnAt(messages: ReturnType<typeof thread>, index: number) {
			return startTurn({ threadTs: messages[0].ts, messageTs: messages[index].ts, text: messages[index].text });
		}

		const shown = (prompt: string) => [...prompt.matchAll(/message (\d+)/g)].map((match) => Number(match[1]));

		it("puts the message answered and the ones right before it in the prompt, not the thread's first 15", async () => {
			// 3 minutes apart: the thread is two hours long, so its first 15 messages are long gone from the conversation.
			const messages = thread(180, [39]);
			world.slack.replies = messages;
			const agent = new ScriptedAgent(async () => answer());
			await runTurn(deps(agent), await turnAt(messages, 39), step);

			const [read] = world.slack.of("conversations.replies");
			expect(read.args).toEqual({ channel: "C0CHANNEL1", ts: messages[0].ts, oldest: `${START + 39 * 180 - 30 * 60}.000100`, latest: messages[39].ts, inclusive: true, limit: 15 });
			const prompt = agent.requests[0].prompt;
			expect(prompt.split("\n").slice(0, 3)).toEqual([
				"The first message in this Slack thread:",
				"<@U0PERSON03>: message 0",
				"",
			]);
			expect(prompt).toContain("The latest messages in this Slack thread before the new one, oldest first:\n<@U0PERSON02>: message 29\n");
			// The thread's first message, the 10 messages before the one answered, and that message.
			expect(shown(prompt)).toEqual([0, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
			expect(prompt).toContain("<@U0PERSON03>: message 38\n\nNew message from <@U0PERSON01>:\nmessage 39: what do you make of this?");
			expect(prompt).not.toContain("missing");
		});

		it("in a busy thread, says what it couldn't read, then reads on from its last answer", async () => {
			// 30 seconds apart: the half hour before the 30th message holds the whole thread, more than Slack returns.
			const messages = thread(30, [29, 39]);
			world.slack.replies = messages.slice(0, 30);
			const agent = new ScriptedAgent(async (_request, hooks) => {
				await hooks.onText("Here is what I make of it.");
				return answer();
			});
			const first = await turnAt(messages, 29);
			await runTurn(deps(agent), first, step);
			expect(shown(agent.requests[0].prompt)).toEqual([0, ...Array.from({ length: 15 }, (_, index) => index + 1), 29]);
			expect(agent.requests[0].prompt).toContain("<@U0PERSON02>: message 15\n(Slack returned only part of this stretch of the thread, so some of its messages are missing.)\n");
			// Nothing before the answered message is known to follow on, so the next read starts there.
			expect(coordinatorOf(first).knownMessages()).toEqual([messages[29].ts, "1792600100.000001"]);

			// The answer lands between the 30th and 31st messages, and ten more are written.
			world.slack.replies = [...messages.slice(0, 30), { ts: "1792600100.000001", bot_id: "B0BOT00001", user: BOT_USER_ID, text: "Here is what I make of it." }, ...messages.slice(30)];
			await runTurn(deps(agent), await turnAt(messages, 39), step);
			expect(world.slack.of("conversations.replies")[1].args).toMatchObject({ oldest: messages[29].ts, latest: messages[39].ts });
			const prompt = agent.requests[1].prompt;
			expect(shown(prompt)).toEqual([0, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39]);
			expect(prompt).toContain("<@U0PERSON01>: message 29: what do you make of this?\nYou (Phaseo agent): Here is what I make of it.\n<@U0PERSON03>: message 30\n");
			// The reply is shown once: Slack returned it, so it isn't repeated from working memory.
			expect(prompt).not.toContain("Your earlier replies");
			expect(prompt).not.toContain("missing");
		});
	});

	it("in a direct message, reads its newest exchanges with the person and keeps earlier replies from memory", async () => {
		const channel = "D0DIRECT01";
		const threadTs = "1792590000.000100";
		const agent = new ScriptedAgent(async (_request, hooks, call) => {
			await hooks.onText(`answer ${call - 1}`);
			return answer();
		});
		// Twelve questions ten minutes apart, each answered 30 seconds later. Every message in a DM is a turn, so the coordinator knows them all.
		const questionTs = (index: number) => `${1_792_590_000 + index * 600}.000100`;
		const answerTs = (index: number) => `${1_792_590_000 + index * 600 + 30}.000100`;
		world.slack.replies = [];
		for (let index = 0; index < 12; index += 1) {
			world.slack.nextTs = () => answerTs(index);
			world.slack.replies.push({ ts: questionTs(index), user: "U0PERSON01", text: `question ${index}` });
			await runTurn(deps(agent), await startTurn({ channel, threadTs, messageTs: questionTs(index), text: `question ${index}` }), step);
			world.slack.replies.push({ ts: answerTs(index), bot_id: "B0BOT00001", user: BOT_USER_ID, text: `answer ${index}` });
		}
		const reads = world.slack.of("conversations.replies");
		expect(reads).toHaveLength(11);
		// The read starts at the oldest of the 8 newest messages known before the question (no 30-minute limit in a DM).
		expect(reads.at(-1)!.args).toMatchObject({ oldest: questionTs(7), latest: questionTs(11) });
		expect(agent.requests.at(-1)!.prompt).toBe([
			"The first message in this Slack thread:",
			"<@U0PERSON01>: question 0",
			"",
			"Your earlier replies and lookups in this thread, oldest first:",
			...[0, 1, 2, 3, 4, 5, 6].map((index) => `You (Phaseo agent): answer ${index}`),
			"",
			"The latest messages in this Slack thread before the new one, oldest first:",
			...[7, 8, 9, 10].flatMap((index) => [`<@U0PERSON01>: question ${index}`, `You (Phaseo agent): answer ${index}`]),
			"",
			"New message from <@U0PERSON01>:",
			"question 11",
		].join("\n"));
	});

	describe("the Connect button when everyone can use the agent", () => {
		/** An agent that, like a model asked about spend, calls connect_phaseo_account and reports what it said. */
		function askingAboutSpend(results: unknown[]) {
			return new ScriptedAgent(async (request) => {
				const tool = request.tools.find((entry) => entry.id === "connect_phaseo_account");
				if (tool) results.push(await (tool.execute as (input: unknown, context: unknown) => Promise<unknown>)({}, {}));
				return answer();
			});
		}

		const buttons = () => world.slack.ephemerals().filter((call) => JSON.stringify(call.args.blocks ?? []).includes("connect_account"));

		it("sends someone who isn't linked the button privately when they ask about usage, once per thread, and still answers", async () => {
			const results: unknown[] = [];
			const agent = askingAboutSpend(results);
			const threadTs = "1792600000.000300";
			await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01", threadTs, messageTs: threadTs }), step);
			expect(agent.requests[0].instructions).toContain("call connect_phaseo_account to send them a private button");
			expect(results[0]).toMatchObject({ sent: true });
			const [button] = buttons();
			// The thread's first message: Slack only shows a thread_ts ephemeral in a thread that has replies.
			expect(button.args).toMatchObject({ channel: "D0DIRECT01", user: "U0PERSON01", text: "Connect your Phaseo account so the Phaseo agent can answer questions about this workspace's Phaseo usage. The button works for 15 minutes." });
			expect(button.args.thread_ts).toBeUndefined();
			const url = new URL(JSON.stringify(button.args.blocks).match(/"url":"([^"]+)"/)![1]);
			expect(`${url.origin}${url.pathname}`).toBe("https://phaseo.app/slack/link");
			expect(url.searchParams.get("token")).toBeTruthy();
			// It still answered.
			expect(step.outputs.filter((entry) => entry.name === "run").at(-1)?.output).toMatchObject({ status: "answered" });

			// A follow-up in the same thread: no second button.
			await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01", threadTs, messageTs: "1792600000.000400" }), step);
			expect(results[1]).toMatchObject({ sent: false });
			expect(buttons()).toHaveLength(1);

			// A new thread is a new question: it gets a fresh button.
			await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
			expect(results[2]).toMatchObject({ sent: true });
			expect(buttons()).toHaveLength(2);
		});

		it("offers it again in the thread when Slack didn't deliver it", async () => {
			const results: unknown[] = [];
			const agent = askingAboutSpend(results);
			const threadTs = "1792600000.000500";
			world.slack.failures.set("chat.postEphemeral", ["channel_not_found"]);
			await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01", threadTs, messageTs: threadTs }), step);
			expect(results[0]).toMatchObject({ sent: false, note: expect.stringContaining("didn't deliver") });
			await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01", threadTs, messageTs: "1792600000.000600" }), step);
			expect(results[1]).toMatchObject({ sent: true });
			// In a thread with replies, the button goes in the thread.
			expect(buttons().at(-1)?.args.thread_ts).toBe(threadTs);
		});

		it("isn't offered where linking wouldn't bring the usage tools, nor to someone already linked", async () => {
			const agent = new ScriptedAgent(async () => answer());
			const toolIds = () => offeredTools(agent.requests.at(-1)!);
			// A channel that usage_data_mode doesn't cover.
			await runTurn(deps(agent), await startTurn({ channel: "C0CHANNEL1" }), step);
			expect(toolIds()).toEqual([]);
			expect(agent.requests.at(-1)!.instructions).toContain("can ask in a direct message");
			// A channel it covers.
			await install({ usage_data_mode: "dm_and_channels", usage_data_channel_ids: ["C0FINANCE1"] });
			await runTurn(deps(agent), await startTurn({ channel: "C0FINANCE1" }), step);
			expect(toolIds()).toEqual(["connect_phaseo_account"]);
			// Usage data off.
			await install({ usage_data_mode: "off" });
			await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
			expect(toolIds()).toEqual([]);
			// Linked, but not a member of the workspace: connecting again wouldn't help.
			await install();
			world.db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: USER });
			await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
			expect(toolIds()).toEqual([]);
			expect(buttons()).toHaveLength(0);
		});
	});

	it("never runs the model again when a Slack write fails: the reply step delivers the whole answer", async () => {
		world.slack.failures.set("chat.appendStream", ["internal_error"]);
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("Part one");
			world.clock.now += 500;
			await hooks.onText(", part two");
			await hooks.onStep({ costUsd: 0.001 });
			world.clock.now += 500;
			await hooks.onText(", part three.");
			return answer("openai/gpt-test", 0.001);
		});
		const turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(agent.requests).toHaveLength(1);
		expect(step.failures).toEqual([]);
		expect(world.slack.of("chat.startStream")).toHaveLength(1);
		expect(world.slack.of("chat.appendStream")).toHaveLength(1);
		expect(world.slack.calls.slice(-2).map((call) => [call.method, call.args])).toEqual([
			["chat.stopStream", { channel: "C0CHANNEL1", ts: "1792600100.000001" }],
			["chat.update", { channel: "C0CHANNEL1", ts: "1792600100.000001", markdown_text: `Part one, part two, part three.\n\n${markdownFooter(turn, "$0.0010")}` }],
		]);
		// Stopping the stream also set the session back to active.
		expect(world.slack.of("agents.sessions.setStatus").map((call) => call.args.status)).toEqual(["processing"]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		expect(coordinatorOf(turn).workingMemory()).toEqual([{ kind: "reply", text: "Part one, part two, part three.", at: world.clock.now, ts: "1792600100.000001" }]);
	});

	it("posts the whole answer when the stream never started, and doesn't run the model again", async () => {
		world.slack.failures.set("chat.startStream", ["internal_error"]);
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("Hello");
			return answer();
		});
		const turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(agent.requests).toHaveLength(1);
		expect(world.slack.of("chat.postMessage").map((call) => call.args)).toEqual([
			{ channel: "C0CHANNEL1", thread_ts: turn.threadTs, markdown_text: `Hello\n\n${markdownFooter(turn, "$0.0123")}` },
		]);
		expect(world.slack.of("agents.sessions.setStatus").map((call) => call.args.status)).toEqual(["processing", "active"]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
	});

	it("retries the reply step, not the model, when Slack's footer update fails", async () => {
		// The person pressed stop just as the answer ended, so the footer goes on with an update, which fails once.
		world.slack.failures.set("chat.stopStream", ["message_not_in_streaming_state", "message_not_in_streaming_state"]);
		world.slack.failures.set("chat.update", ["internal_error"]);
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("Answer");
			return answer();
		});
		const turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(step.failures).toEqual([{ name: "reply", attempt: 1 }]);
		expect(agent.requests).toHaveLength(1);
		expect(world.slack.of("chat.update").map((call) => call.args.markdown_text)).toEqual([
			`Answer\n\n${markdownFooter(turn, "$0.0123")}`,
			`Answer\n\n${markdownFooter(turn, "$0.0123")}`,
		]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 1 });
	});

	it("counts every attempt's cost against the turn's limit and in the footer when the run step is retried", async () => {
		let turn!: TurnRef;
		const agent = new ScriptedAgent(async (request, hooks, call) => {
			if (call === 1) {
				await hooks.onText("First try");
				await hooks.onStep({ costUsd: 0.3 });
				// The step dies after the model was paid (here: the coordinator can't stage the end of it).
				const coordinator = coordinatorOf(turn);
				const stage = coordinator.stageTurnOutput.bind(coordinator);
				coordinator.stageTurnOutput = () => {
					coordinator.stageTurnOutput = stage;
					throw new Error("storage_unavailable");
				};
				return answer("openai/gpt-test", 0.3);
			}
			expect(request.maxCostUsd).toBeCloseTo(0.2, 9);
			await hooks.onText("Second try");
			return answer("openai/gpt-test", 0.1);
		});
		turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(step.failures).toEqual([{ name: "run", attempt: 1 }]);
		expect(agent.requests.map((request) => request.maxCostUsd)).toEqual([0.5, expect.closeTo(0.2, 9)]);
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ costNanos: 400_000_000, streamed: false });
		expect(world.slack.of("chat.startStream")).toHaveLength(1);
		expect(world.slack.of("chat.update").at(-1)?.args.markdown_text).toBe(`Second try\n\n${markdownFooter(turn, "$0.4000")}`);
	});

	it("doesn't run the model again when earlier attempts used the whole limit", async () => {
		let turn!: TurnRef;
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("A long answer");
			await hooks.onStep({ costUsd: 0.5 });
			const coordinator = coordinatorOf(turn);
			const stage = coordinator.stageTurnOutput.bind(coordinator);
			coordinator.stageTurnOutput = () => {
				coordinator.stageTurnOutput = stage;
				throw new Error("storage_unavailable");
			};
			return answer("openai/gpt-test", 0.5);
		});
		turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(agent.requests).toHaveLength(1);
		expect(world.slack.of("chat.update").at(-1)?.args.markdown_text).toBe(
			`A long answer\n\n_I stopped here to keep this answer within its $0.50 cost limit._\n\n${markdownFooter(turn, "$0.5000", "Auto")}`,
		);
		expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
	});

	it("stops between steps when the thread is cancelled, and doesn't count the answer", async () => {
		let turn!: TurnRef;
		const agent = new ScriptedAgent(async (request, hooks) => {
			await hooks.onText("Looking at your spend");
			await coordinatorOf(turn).cancel(NOW);
			await hooks.onStep({ costUsd: 0 });
			expect(request.signal.aborted).toBe(true);
			throw new Error("aborted");
		});
		turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "cancelled" });
		expect(world.slack.of("chat.appendStream").map((call) => call.args.markdown_text)).toEqual(["\n\n_Stopped._"]);
		expect(world.slack.of("chat.stopStream")[0].args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0000", "Auto") }] }]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		expect(coordinatorOf(turn).status()).toMatchObject({ running: null });
	});

	it("turns gateway errors into plain replies that are not counted", async () => {
		const cases: Array<[number, Record<string, unknown>, string]> = [
			[402, { error: { code: "insufficient_funds" } }, "This Phaseo workspace is out of credits, so I can't answer right now. An admin can add credits in Phaseo billing."],
			[429, { reason: "monthly_cost_limit_reached" }, "The Phaseo agent's monthly spending limit on its Phaseo key has been reached. An admin can raise it in Phaseo settings."],
			[404, { error: { code: "model_not_found" } }, "The model this agent uses isn't available right now. Please try again in a few minutes, or an admin can choose another model in Phaseo settings."],
			// The key's guardrail leaves the model no provider, or the workspace can't use Auto.
			[403, { error: { code: "guardrail_blocked", message: "No provider routes satisfy the workspace data-handling policy" }, code: "guardrail_blocked", error_operational_kind: "data_handling_policy_no_routes" },
				"The model chosen for this agent isn't available to the Slack agent. An admin can choose another model in Phaseo settings."],
			// The test installation asks for phaseo/auto.
			[400, { error: { code: "not_supported", message: "Auto Routing is currently available to selected Alpha workspaces." }, code: "not_supported" },
				"The model chosen for this agent isn't available to the Slack agent. An admin can choose another model in Phaseo settings."],
		];
		for (const [status, body, text] of cases) {
			world.slack.calls = [];
			const agent = new ScriptedAgent(async () => { throw new AgentGatewayError({ status, statusText: "Error", body }); });
			await expect(runTurn(deps(agent), await startTurn(), step)).resolves.toEqual({ status: "failed" });
			expect(world.slack.of("chat.startStream")[0].args.markdown_text).toBe(text);
			// No footer on an error.
			expect(world.slack.of("chat.stopStream")[0].args.blocks).toBeUndefined();
		}
		expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
	});

	it("answers with the model chosen for the message, in the answer's own gateway session, and names it in the footer", async () => {
		await install({ model: "phaseo/auto", model_choice_enabled: true, allowed_models: ["anthropic/claude-test"] });
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("Summary.");
			return answer("claude-test-2026-10");
		});
		// events.ts queued it without its `with claude:`.
		const turn = await startTurn({ model: "anthropic/claude-test", text: `<@${BOT_USER_ID}> summarise this thread` });
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(agent.requests[0]).toMatchObject({ model: "anthropic/claude-test", sessionId: `slack-${turn.eventId}` });
		expect(agent.requests[0].prompt).toBe("New message from <@U0PERSON01>:\nsummarise this thread");
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ requestedModel: "anthropic/claude-test", model: "claude-test-2026-10" });
		// The model actually chosen, linked to its page; the cost to the answer's requests in Logs.
		expect(world.slack.of("chat.stopStream")[0].args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0123", "<https://phaseo.app/models/anthropic/claude-test|Claude Test>") }] }]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
	});

	it("answers with the agent's model when an admin no longer allows the one chosen for a queued message", async () => {
		const agent = new ScriptedAgent(async () => answer());
		await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["openai/gpt-test"] });
		await runTurn(deps(agent), await startTurn({ model: "anthropic/claude-test" }), step);
		await install({ model: "openai/gpt-test", model_choice_enabled: false, allowed_models: ["anthropic/claude-test"] });
		await runTurn(deps(agent), await startTurn({ model: "anthropic/claude-test" }), step);
		expect(agent.requests.map((request) => request.model)).toEqual(["openai/gpt-test", "openai/gpt-test"]);
	});

	it("says when the model chosen for the message can't be used", async () => {
		await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["anthropic/claude-test"] });
		const body = { error: { code: "guardrail_blocked" }, code: "guardrail_blocked", error_operational_kind: "data_handling_policy_no_routes" };
		const agent = new ScriptedAgent(async () => { throw new AgentGatewayError({ status: 403, statusText: "Forbidden", body }); });
		await expect(runTurn(deps(agent), await startTurn({ model: "anthropic/claude-test" }), step)).resolves.toEqual({ status: "failed" });
		expect(world.slack.of("chat.startStream")[0].args.markdown_text).toBe(
			"The model you chose for this message isn't available to the Slack agent. Ask again without `with …:` to use the agent's model, or an admin can change the models you can choose in Phaseo settings.",
		);
		expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
	});

	describe("asking another model", () => {
		const CLAUDE_PAGE = "https://phaseo.app/models/anthropic/claude-test";
		type Execute = (input: unknown, context: unknown) => Promise<Record<string, unknown>>;
		const askTool = (request: AgentTurnRequest) => request.tools.find((tool) => tool.id === "ask_model");

		it("asks another allowed model mid-answer: same key, labels, user and session, its cost in the limit, and every model in the footer", async () => {
			await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["openai/gpt-test", "anthropic/claude-test"] });
			const results: unknown[] = [];
			const agent = new ScriptedAgent(async (request, hooks) => {
				// The runner reports its own spend before the tool runs, as the real one does.
				hooks.onCost?.(0.01);
				results.push(await (askTool(request)!.execute as Execute)({ model: "anthropic/claude-test", prompt: "Is $12.50 right for 5 seats at $2.50?" }, {}));
				await hooks.onText("Yes. Claude Test agrees: 5 × $2.50 = $12.50.");
				await hooks.onStep({ costUsd: 0.01 + request.otherCostUsd!() });
				return answer("openai/gpt-test", 0.01 + request.otherCostUsd!());
			}, async (request) => {
				zeroDataRetention.push(await request.zeroDataRetention!());
				return { text: "Yes, that's right.", costUsd: 0.02 };
			});
			const zeroDataRetention: boolean[] = [];
			const turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });

			expect(agent.asks).toEqual([{
				gatewayKey: GATEWAY_KEY,
				endUser: `slack:${TEAM_ID}:U0PERSON01`,
				sessionId: `slack-${turn.eventId}`,
				labels: { slackTeam: TEAM_ID, slackChannel: "C0CHANNEL1" },
				model: "anthropic/claude-test",
				instructions: expect.stringContaining("Phaseo agent in Slack"),
				prompt: "Is $12.50 right for 5 seats at $2.50?",
				maxOutputTokens: 4_000,
				webTools: false,
				signal: agent.requests[0].signal,
				zeroDataRetention: expect.any(Function),
			}]);
			// Asked as the consult is sent: no Slack search in this answer, so any provider the guardrail allows.
			expect(zeroDataRetention).toEqual([false]);
			expect(results).toEqual([{ model: "anthropic/claude-test", name: "Claude Test", answer: "Yes, that's right.", cost_usd: 0.02, asks_left: 2, budget_left_usd: 0.47 }]);
			// Both models, each linked to its page, and the total with the consult.
			expect(world.slack.of("chat.stopStream")[0].args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0300", `<${GPT_PAGE}|GPT Test> + <${CLAUDE_PAGE}|Claude Test>`) }] }]);
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ costNanos: 30_000_000, consulted: ["anthropic/claude-test"] });
			// Working memory notes the model asked, never what was asked.
			expect(coordinatorOf(turn).workingMemory().map((entry) => entry.text)).toEqual(["ask_model anthropic/claude-test", "Yes. Claude Test agrees: 5 × $2.50 = $12.50."]);
			expect(JSON.stringify(step.outputs)).not.toContain("seats");
			expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		});

		it("is offered only with model choice on and another allowed model than the one answering", async () => {
			const agent = new ScriptedAgent(async () => answer());
			const offered = () => agent.requests.at(-1)!.tools.some((tool) => tool.id === "ask_model");
			await runTurn(deps(agent), await startTurn(), step);
			expect(offered()).toBe(false);
			await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["openai/gpt-test"] });
			await runTurn(deps(agent), await startTurn(), step);
			expect(offered()).toBe(false);
			// The person chose Claude Test for this message: GPT Test is the other model.
			await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["openai/gpt-test", "anthropic/claude-test"] });
			await runTurn(deps(agent), await startTurn({ model: "anthropic/claude-test" }), step);
			expect((askTool(agent.requests.at(-1)!)!.parameters as { properties: { model: { enum: string[] } } }).properties.model.enum).toEqual(["openai/gpt-test"]);
			await install({ model: "openai/gpt-test", model_choice_enabled: false, allowed_models: ["openai/gpt-test", "anthropic/claude-test"] });
			await runTurn(deps(agent), await startTurn(), step);
			expect(offered()).toBe(false);
		});

		it("counts a consult's cost when the run fails after it, and a retry's limit includes it", async () => {
			await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["openai/gpt-test", "anthropic/claude-test"] });
			const agent = new ScriptedAgent(async (request, hooks, call) => {
				if (call === 1) {
					hooks.onCost?.(0.05);
					await (askTool(request)!.execute as Execute)({ model: "anthropic/claude-test", prompt: "a" }, {});
					throw new Error("network");
				}
				return answer("openai/gpt-test", 0.01);
			}, async () => ({ text: "ok", costUsd: 0.2 }));
			const turn = await startTurn();
			await runTurn(deps(agent), turn, step);
			// The first attempt failed with $0.25 spent: the model's own $0.05 and the $0.20 consult.
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "failed", costNanos: 250_000_000, consulted: ["anthropic/claude-test"] });
		});
	});

	describe("Compare", () => {
		const CLAUDE_PAGE = "https://phaseo.app/models/anthropic/claude-test";
		const compareInstall = () => install({ model: "phaseo/auto", model_choice_enabled: true, allowed_models: ["openai/gpt-test", "anthropic/claude-test"] });

		it("asks each model at once and posts one reply with a section per model and the total, counted as one answer", async () => {
			await compareInstall();
			const agent = new ScriptedAgent(async () => { throw new Error("the agent doesn't run for a Compare"); }, async (request) => (
				request.model === "openai/gpt-test" ? { text: "GPT says A.", costUsd: 0.0123 } : { text: "Claude says B.", costUsd: 0.0201 }
			));
			// events.ts queued it with the models, and the question without `compare …:`.
			const turn = await startTurn({ compare: ["openai/gpt-test", "anthropic/claude-test"], text: `<@${BOT_USER_ID}> which is faster?` });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
			expect(agent.requests).toEqual([]);
			expect(agent.asks.map((request) => [request.model, request.prompt, request.webTools, request.sessionId])).toEqual([
				["openai/gpt-test", "which is faster?", true, `slack-${turn.eventId}`],
				["anthropic/claude-test", "which is faster?", true, `slack-${turn.eventId}`],
			]);
			expect(agent.asks[0].instructions).toContain("shown next to other models' answers");
			const sections = [
				`**[GPT Test](${GPT_PAGE})** · $0.0123`, "", "GPT says A.", "",
				`**[Claude Test](${CLAUDE_PAGE})** · $0.0201`, "", "Claude says B.",
			].join("\n");
			expect(world.slack.calls.map((call) => [call.method, call.args])).toEqual([
				["agents.sessions.setStatus", { channel_id: "C0CHANNEL1", thread_ts: turn.threadTs, status: "processing" }],
				["chat.startStream", { channel: "C0CHANNEL1", thread_ts: turn.threadTs, markdown_text: sections, recipient_user_id: "U0PERSON01", recipient_team_id: TEAM_ID }],
				["chat.stopStream", { channel: "C0CHANNEL1", ts: "1792600100.000001", blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0324", `<${GPT_PAGE}|GPT Test> + <${CLAUDE_PAGE}|Claude Test>`) }] }] }],
			]);
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toEqual({
				status: "answered", ts: "1792600100.000001", streamed: true, explained: true, costNanos: 32_400_000,
				requestedModel: "openai/gpt-test", model: null, error: null, consulted: ["anthropic/claude-test"],
			});
			expect(JSON.stringify(step.outputs)).not.toMatch(/faster|says/);
			expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
			expect(coordinatorOf(turn).workingMemory()).toEqual([{ kind: "reply", text: sections, at: world.clock.now, ts: "1792600100.000001" }]);
		});

		it("doesn't ask the models when what earlier attempts left of the limit is too small to share", async () => {
			await compareInstall();
			const agent = new ScriptedAgent(async () => answer(), async () => ({ text: "ok", costUsd: 0.01 }));
			const turn = await startTurn({ compare: ["openai/gpt-test", "anthropic/claude-test"], text: "which is faster?" });
			// An earlier attempt spent $0.47: $0.015 each is left.
			coordinatorOf(turn).stageTurnOutput(turn.turnId, { attempt: 0, costNanos: 470_000_000, reply: "", tools: [] });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "failed" });
			expect(agent.asks).toEqual([]);
			expect(world.slack.of("chat.startStream")[0].args.markdown_text).toBe([
				`**[GPT Test](${GPT_PAGE})**`, "", "_Not asked: this answer's $0.50 limit was already used._", "",
				`**[Claude Test](${CLAUDE_PAGE})**`, "", "_Not asked: this answer's $0.50 limit was already used._",
			].join("\n"));
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "failed", costNanos: 470_000_000, error: null });
		});

		it("shows a failed model's error in its section and keeps the others", async () => {
			await compareInstall();
			const agent = new ScriptedAgent(async () => answer(), async (request) => {
				if (request.model === "anthropic/claude-test") throw new AgentGatewayError({ status: 404, statusText: "Not Found", body: { error: { code: "model_not_found" } } });
				return { text: "GPT says A.", costUsd: 0.0123 };
			});
			const turn = await startTurn({ compare: ["openai/gpt-test", "anthropic/claude-test"], text: "which is faster?" });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
			expect(world.slack.of("chat.startStream")[0].args.markdown_text).toBe([
				`**[GPT Test](${GPT_PAGE})** · $0.0123`, "", "GPT says A.", "",
				`**[Claude Test](${CLAUDE_PAGE})**`, "", "_This model isn't available right now. Please try again in a few minutes._",
			].join("\n"));
			expect(world.slack.of("chat.stopStream")[0].args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0123", `<${GPT_PAGE}|GPT Test> + <${CLAUDE_PAGE}|Claude Test>`) }] }]);
			expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		});

		it("isn't counted when every model fails, and has no footer", async () => {
			await compareInstall();
			const agent = new ScriptedAgent(async () => answer(), async () => { throw new AgentGatewayError({ status: 402, statusText: "Payment Required", body: { error: { code: "insufficient_funds" } } }); });
			const turn = await startTurn({ compare: ["openai/gpt-test", "anthropic/claude-test"], text: "which is faster?" });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "failed" });
			expect(world.slack.of("chat.startStream")[0].args.markdown_text).toContain("_This Phaseo workspace is out of credits. An admin can add credits in Phaseo billing._");
			expect(world.slack.of("chat.stopStream")[0].args.blocks).toBeUndefined();
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "failed", error: "no_credits" });
			expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		});

		it("isn't counted when every model runs out of output without an answer, but keeps what they cost", async () => {
			await compareInstall();
			const agent = new ScriptedAgent(async () => answer(), async () => ({ text: "", costUsd: 0.02 }));
			const turn = await startTurn({ compare: ["openai/gpt-test", "anthropic/claude-test"], text: "which is faster?" });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "failed" });
			expect(world.slack.of("chat.startStream")[0].args.markdown_text).toContain("_No answer: this model used its whole output allowance before writing one._");
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "failed", error: "failed", costNanos: 40_000_000 });
			expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		});

		it("stops when the thread is cancelled while the models answer, and isn't counted", async () => {
			await compareInstall();
			let turn!: TurnRef;
			const agent = new ScriptedAgent(async () => answer(), async () => {
				await coordinatorOf(turn).cancel(NOW);
				return { text: "too late", costUsd: 0.01 };
			});
			turn = await startTurn({ compare: ["openai/gpt-test", "anthropic/claude-test"], text: "which is faster?" });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "cancelled" });
			expect(world.slack.of("chat.startStream")[0].args.markdown_text).toBe("_Stopped._");
			expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		});

		it("answers as usual when an admin no longer allows two of the models", async () => {
			await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["openai/gpt-test"] });
			const agent = new ScriptedAgent(async () => answer());
			await expect(runTurn(deps(agent), await startTurn({ compare: ["openai/gpt-test", "anthropic/claude-test"], text: "which is faster?" }), step)).resolves.toEqual({ status: "answered" });
			expect(agent.requests.map((request) => request.model)).toEqual(["openai/gpt-test"]);
			expect(agent.asks).toEqual([]);
		});
	});

	it("notes when a limit stopped the answer early", async () => {
		const agent = new ScriptedAgent(async (_request, hooks) => {
			await hooks.onText("Partial answer");
			return { costUsd: 0.5, model: "openai/gpt-test", stopReason: "max_cost:0.5" };
		});
		const turn = await startTurn();
		await runTurn(deps(agent), turn, step);
		expect(coordinatorOf(turn).workingMemory()[0].text).toBe("Partial answer\n\n_I stopped here to keep this answer within its $0.50 cost limit._");
	});

	it("skips a turn the installation no longer allows, and gives its meter place back", async () => {
		const agent = new ScriptedAgent(async () => answer());
		await install({ status: "paused" });
		await expect(runTurn(deps(agent), await startTurn(), step)).resolves.toEqual({ status: "skipped" });
		await install({ access_mode: "linked" });
		await expect(runTurn(deps(agent), await startTurn(), step)).resolves.toEqual({ status: "skipped" });
		world.db.tables.slack_installations = [];
		await expect(runTurn(deps(agent), await startTurn(), step)).resolves.toEqual({ status: "skipped" });
		expect(agent.requests).toHaveLength(0);
		expect(world.slack.calls).toHaveLength(0);
		expect(meter().usage(NOW).pending).toBe(0);
	});

	describe("questions with buttons", () => {
		const QUESTION_TS = "1792600100.000002";
		/** The paused run the runner hands back; the turn keeps it in the coordinator and passes it back as it is. */
		const PAUSED = {
			run: { id: "run_q", agentId: "phaseo-slack-agent", status: "waiting_for_human", input: null, messages: [{ role: "user", content: "hello" }], stepCount: 1, createdAt: "2026-10-21T12:00:00.000Z", updatedAt: "2026-10-21T12:00:00.000Z" },
			steps: [], stepResults: [], messages: [], items: [],
		} as unknown as PausedRun;

		type Asking = { before?: string; question?: Record<string, unknown>; costs?: [number, number]; after?: (request: AgentTurnRequest) => Promise<string> };

		/** An agent that writes `before`, asks with the real ask_question tool (which pauses the run), then answers from the person's answer. */
		function askingAgent(options: Asking = {}) {
			const [firstCost, secondCost] = options.costs ?? [0.1, 0.05];
			return new ScriptedAgent(async (request, hooks) => {
				if (!request.resume) {
					if (options.before) await hooks.onText(options.before);
					await hooks.onStep({ costUsd: firstCost });
					const tool = request.tools.find((entry) => entry.id === "ask_question")!;
					const paused = await tool.onToolCalled!(options.question ?? { question: "Which region?", options: ["EU", "US"] }, { stepIndex: 0, toolCall: { id: "call_q1", name: "ask_question", input: {} } } as never);
					if (paused !== null) throw new Error(`question refused: ${JSON.stringify(paused)}`);
					return { costUsd: firstCost, model: "openai/gpt-test", stopReason: null, paused: PAUSED };
				}
				await hooks.onText(options.after ? await options.after(request) : "Done.");
				return answer("openai/gpt-test", secondCost);
			});
		}

		function click(turn: TurnRef, user: string, choice: number | "other") {
			return handleInteraction(world.deps, hostedApp(world.env)!, {
				type: "block_actions",
				api_app_id: HOSTED_APP_ID,
				team: { id: TEAM_ID },
				user: { id: user, team_id: TEAM_ID },
				channel: { id: turn.channel },
				container: { channel_id: turn.channel, message_ts: QUESTION_TS, thread_ts: turn.threadTs },
				message: { ts: QUESTION_TS, thread_ts: turn.threadTs },
				trigger_id: "1337.42.abcdef",
				actions: [{ action_id: choice === "other" ? "question_other" : `question_answer_${choice}`, value: answerValue(turn.threadTs, turn.turnId, 1, choice) }],
			});
		}

		/** Updates of the question's message (replies are updated with markdown_text, never blocks). */
		const questionUpdates = () => world.slack.of("chat.update").filter((call) => Array.isArray(call.args.blocks));
		const context = (call: SlackCall) => JSON.stringify((call.args.blocks as unknown[]).at(-1));

		it("posts the question with buttons, waits for the answer, and continues the run from it as one answer", async () => {
			let turn!: TurnRef;
			const agent = askingAgent({
				before: "One thing first.",
				after: async (request) => {
					expect(request.resume?.toolOutputs).toEqual([{ toolCallId: "call_q1", output: { answered: true, answer: "EU" } }]);
					expect(request.resume?.run).toEqual(JSON.parse(JSON.stringify(PAUSED)));
					// The earlier run's spend counts against the turn's limit.
					expect(request.maxCostUsd).toBeCloseTo(0.4, 9);
					// No step left after this one: the tool says so instead of pausing.
					const tool = request.tools.find((entry) => entry.id === "ask_question")!;
					expect(await tool.onToolCalled!({ question: "Again?", options: ["Yes", "No"] }, { stepIndex: 11, toolCall: { id: "call_q2" } } as never)).toMatchObject({ asked: false, error: expect.stringContaining("no steps left") });
					return "Using EU.";
				},
			});
			step.onWait = async () => {
				// The answer is in progress past the meter's usual 30 minutes, and the coordinator won't time it out while it waits.
				expect(meter().usage(NOW + 45 * 60_000).pending).toBe(1);
				expect(storageOf(coordinatorOf(turn)).alarm).toBe(NOW + 60 * 60_000 + TURN_TIMEOUT_MS);
				await expect(click(turn, "U0PERSON01", 0)).resolves.toBe("answered");
				return "event";
			};
			turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });

			const recipient = { recipient_user_id: "U0PERSON01", recipient_team_id: TEAM_ID };
			expect(world.slack.calls.map((call) => [call.method, call.args.ts ?? null])).toEqual([
				["agents.sessions.setStatus", null],
				["chat.startStream", null],
				// The reply before the question is finished, without a footer.
				["chat.stopStream", "1792600100.000001"],
				["chat.postMessage", null],
				["agents.sessions.setStatus", null],
				// The click shows the answer at once; the close step shows it again.
				["chat.update", QUESTION_TS],
				["chat.update", QUESTION_TS],
				// The answer after the question is a new message, with the footer for the whole answer.
				["chat.startStream", null],
				["chat.stopStream", "1792600100.000003"],
			]);
			expect(world.slack.of("chat.stopStream")[0].args).toEqual({ channel: "C0CHANNEL1", ts: "1792600100.000001" });
			const [question] = world.slack.of("chat.postMessage");
			expect(question.args).toMatchObject({ channel: "C0CHANNEL1", thread_ts: turn.threadTs, text: "Which region?\nOnly <@U0PERSON01> can answer. This question expires in an hour." });
			expect((question.args.blocks as Array<{ type: string; elements?: Array<Record<string, unknown>> }>)[1].elements!.map((button) => [button.action_id, (button.text as { text: string }).text, button.value])).toEqual([
				["question_answer_0", "EU", `${turn.threadTs}|${turn.turnId}|1|0`],
				["question_answer_1", "US", `${turn.threadTs}|${turn.turnId}|1|1`],
			]);
			expect(world.slack.of("agents.sessions.setStatus").map((call) => call.args.status)).toEqual(["processing", "processing"]);
			const answered = questionUpdates().at(-1)!;
			expect(answered.args.text).toBe("Which region?\n<@U0PERSON01> chose: EU");
			expect((answered.args.blocks as unknown[]).map((block) => (block as { type: string }).type)).toEqual(["section", "context"]);
			expect(world.slack.of("chat.startStream")[1].args).toEqual({ channel: "C0CHANNEL1", thread_ts: turn.threadTs, markdown_text: "Using EU.", ...recipient });
			expect(world.slack.of("chat.stopStream")[1].args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.1500") }] }]);

			expect(meter().usage(NOW)).toMatchObject({ people: 1, answers: 1, pending: 0 });
			expect(coordinatorOf(turn).workingMemory().map((entry) => [entry.text, entry.ts])).toEqual([
				["One thing first.", "1792600100.000001"],
				["You asked <@U0PERSON01>: Which region? (options: EU, US). <@U0PERSON01> chose: EU", QUESTION_TS],
				["Using EU.", "1792600100.000003"],
			]);
			expect(coordinatorOf(turn).knownMessages()).toEqual([turn.messageTs, "1792600100.000001", QUESTION_TS, "1792600100.000003"]);

			expect(step.outputs.map((entry) => entry.name)).toEqual(["load", "context", "run", "ask-1", "close-1", "resume-1", "reply", "finish"]);
			expect(step.waits).toEqual([{ name: "answer-1", type: "answer-1", timeout: "1 hour" }]);
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toEqual({ status: "waiting", ts: "1792600100.000001", streamed: true, explained: true, costNanos: 100_000_000, requestedModel: "phaseo/auto", model: "openai/gpt-test", error: null, consulted: [], consultCount: 0 });
			expect(step.outputs.find((entry) => entry.name === "resume-1")?.output).toMatchObject({ status: "answered", costNanos: 150_000_000 });
			const stored = JSON.stringify(step.outputs);
			for (const text of ["Which region", "One thing", "Using EU", "\"EU\""]) expect(stored).not.toContain(text);
		});

		it("counts consults before a question toward the answer's three, and names every model asked in the footer", async () => {
			await install({ model: "openai/gpt-test", model_choice_enabled: true, allowed_models: ["openai/gpt-test", "anthropic/claude-test"] });
			let turn!: TurnRef;
			const consult = (request: AgentTurnRequest) => (request.tools.find((tool) => tool.id === "ask_model")!.execute as (input: unknown, context: unknown) => Promise<Record<string, unknown>>)({ model: "anthropic/claude-test", prompt: "check" }, {});
			const results: unknown[] = [];
			const agent = new ScriptedAgent(async (request, hooks) => {
				if (!request.resume) {
					await consult(request);
					await consult(request);
					await hooks.onStep({ costUsd: 0.01 + request.otherCostUsd!() });
					await request.tools.find((tool) => tool.id === "ask_question")!.onToolCalled!({ question: "Which region?", options: ["EU", "US"] }, { stepIndex: 0, toolCall: { id: "call_q1", name: "ask_question", input: {} } } as never);
					return { costUsd: 0.01 + request.otherCostUsd!(), model: "openai/gpt-test", stopReason: null, paused: PAUSED };
				}
				results.push(await consult(request));
				results.push(await consult(request).catch((error: Error) => error.message));
				await hooks.onText("Using EU.");
				return answer("openai/gpt-test", 0.01 + request.otherCostUsd!());
			}, async () => ({ text: "ok", costUsd: 0.01 }));
			step.onWait = async () => {
				await expect(click(turn, "U0PERSON01", 0)).resolves.toBe("answered");
				return "event";
			};
			turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
			// Two before the question, one after; the fourth is refused.
			expect(agent.asks).toHaveLength(3);
			expect(results).toEqual([expect.objectContaining({ asks_left: 0 }), expect.stringContaining("already asked other models 3 times")]);
			expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "waiting", costNanos: 30_000_000, consulted: ["anthropic/claude-test"], consultCount: 2 });
			expect(step.outputs.find((entry) => entry.name === "resume-1")?.output).toMatchObject({ costNanos: 50_000_000, consulted: ["anthropic/claude-test"], consultCount: 3 });
			// The whole answer's footer: both runs' cost, and the model asked.
			expect(world.slack.of("chat.stopStream").at(-1)?.args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.0500", `<${GPT_PAGE}|GPT Test> + <https://phaseo.app/models/anthropic/claude-test|Claude Test>`) }] }]);
		});

		it("lets only the person asked answer, tells anyone else privately, and takes one answer however often they click", async () => {
			let turn!: TurnRef;
			const agent = askingAgent({ after: async (request) => `You chose ${(request.resume?.toolOutputs[0].output as { answer: string }).answer}.` });
			step.onWait = async () => {
				await expect(click(turn, "U0PERSON02", 1)).resolves.toBe("refused");
				await expect(click(turn, "U0PERSON01", 1)).resolves.toBe("answered");
				await expect(click(turn, "U0PERSON01", 0)).resolves.toBe("refused");
				await expect(click(turn, "U0PERSON02", 0)).resolves.toBe("refused");
				return "event";
			};
			turn = await startTurn();
			await runTurn(deps(agent), turn, step);
			expect(agent.requests).toHaveLength(2);
			expect(world.slack.of("chat.startStream").at(-1)?.args.markdown_text).toBe("You chose US.");
			// A second click on their own answer needs no note.
			expect(world.slack.ephemerals().map((call) => [call.args.user, call.args.text, call.args.thread_ts])).toEqual([
				["U0PERSON02", "Only <@U0PERSON01> can answer this question.", turn.threadTs],
				["U0PERSON02", "Only <@U0PERSON01> can answer this question.", turn.threadTs],
			]);
			// After the answer ended, the question is closed.
			await expect(click(turn, "U0PERSON01", 0)).resolves.toBe("refused");
			expect(world.slack.ephemerals().at(-1)?.args.text).toBe("This question is closed, so I can't take an answer to it now. Ask me again in the thread.");
			expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		});

		it("expires after an hour without an answer: says so on the question, ends the answer politely, and still counts it", async () => {
			const agent = askingAgent();
			const turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "expired" });
			expect(agent.requests).toHaveLength(1);
			expect(step.outputs.map((entry) => entry.name)).toEqual(["load", "context", "run", "ask-1", "close-1", "reply", "finish"]);
			const [expired] = questionUpdates();
			expect(expired.args.text).toBe("Which region?\nNo answer within an hour, so I stopped here. Ask me again when you're ready.");
			expect(context(expired)).not.toContain("question_answer");
			// Nothing streamed before the question, so there's no other message.
			expect(world.slack.of("chat.startStream")).toHaveLength(0);
			expect(world.slack.of("agents.sessions.setStatus").map((call) => call.args.status)).toEqual(["processing", "processing", "active"]);
			// The person saw the question: it's their answer.
			expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
			expect(coordinatorOf(turn).workingMemory().map((entry) => entry.text)).toEqual(["You asked <@U0PERSON01>: Which region? (options: EU, US). No answer within an hour, so I stopped here. Ask me again when you're ready."]);
			await expect(click(turn, "U0PERSON01", 0)).resolves.toBe("refused");
		});

		it("stops at once when the thread is stopped while it waits, and doesn't count the answer", async () => {
			let turn!: TurnRef;
			const agent = askingAgent();
			step.onWait = async () => {
				await coordinatorOf(turn).cancel(NOW);
				return "event";
			};
			turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "cancelled" });
			expect(agent.requests).toHaveLength(1);
			expect(questionUpdates().at(-1)?.args.text).toBe("Which region?\nStopped before an answer.");
			expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
			expect(coordinatorOf(turn).status()).toMatchObject({ running: null });
		});

		it("doesn't go on when the thread is stopped after the answer came in, nor once the installation is paused", async () => {
			let turn!: TurnRef;
			step.onWait = async () => {
				await click(turn, "U0PERSON01", 0);
				await coordinatorOf(turn).cancel(NOW);
				return "event";
			};
			const agent = askingAgent();
			turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "cancelled" });
			expect(agent.requests).toHaveLength(1);

			step = new FakeStep();
			step.onWait = async () => {
				await click(turn, "U0PERSON01", 0);
				await install({ status: "paused" });
				return "event";
			};
			const paused = askingAgent();
			turn = await startTurn();
			await expect(runTurn(deps(paused), turn, step)).resolves.toEqual({ status: "cancelled" });
			expect(paused.requests).toHaveLength(1);
			expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		});

		it("ends at once, without waiting, when the thread is stopped while the question is being posted", async () => {
			let turn!: TurnRef;
			// The stop lands after Slack posted the question but before the coordinator opened it.
			world.slack.nextTs = () => {
				world.slack.nextTs = null;
				void coordinatorOf(turn).cancel(NOW);
				return QUESTION_TS;
			};
			const agent = askingAgent();
			turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "cancelled" });
			expect(step.waits).toEqual([]);
			expect(agent.requests).toHaveLength(1);
			expect(questionUpdates().at(-1)?.args.text).toBe("Which region?\nStopped before an answer.");
			expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		});

		it("reads access again after a question: usage tools taken away while it waited aren't offered, and a removed link stops the answer", async () => {
			world.db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: USER });
			world.db.tables.workspace_members.push({ workspace_id: WORKSPACE_ID, user_id: USER });
			let turn!: TurnRef;
			let resumedTools: string[] = [];
			const agent = askingAgent({ after: async (request) => { resumedTools = request.tools.map((tool) => tool.id); return "Done."; } });
			step.onWait = async () => {
				world.db.tables.workspace_members = [];
				await click(turn, "U0PERSON01", 0);
				return "event";
			};
			turn = await startTurn({ channel: "D0DIRECT01" });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
			expect(agent.requests[0].tools.map((tool) => tool.id)).toContain("get_spend");
			expect(resumedTools).not.toContain("get_spend");

			// Only linked people may use it, and the link went while it waited: the answer stops there.
			step = new FakeStep();
			await install({ access_mode: "linked" });
			world.db.tables.workspace_members.push({ workspace_id: WORKSPACE_ID, user_id: USER });
			step.onWait = async () => {
				world.db.tables.slack_user_links = [];
				await click(turn, "U0PERSON01", 0);
				return "event";
			};
			const stopped = askingAgent();
			turn = await startTurn({ channel: "D0DIRECT01" });
			world.slack.calls = [];
			await expect(runTurn(deps(stopped), turn, step)).resolves.toEqual({ status: "failed" });
			expect(stopped.requests).toHaveLength(1);
			// The person is told why, privately, and the session isn't left processing.
			expect(world.slack.ephemerals().map((call) => [call.args.user, call.args.text])).toEqual([
				["U0PERSON01", "I stopped here: what you can use the Phaseo agent for changed while I waited for your answer. Ask me again if you still need this."],
			]);
			expect(world.slack.of("agents.sessions.setStatus").map((call) => call.args.status).at(-1)).toBe("active");
			// Not counted: only the first answer is, and no place is held.
			expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		});

		it("keeps the meter places of turns queued behind a question for as long as it waits", async () => {
			let turn!: TurnRef;
			step.onWait = async () => {
				expect(meter().usage(NOW + 45 * 60_000).pending).toBe(2);
				await click(turn, "U0PERSON01", 0);
				return "event";
			};
			turn = await startTurn();
			// Someone else asks in the same thread before the question goes out: queued behind it.
			const coordinator = coordinatorOf(turn);
			meter().admit({
				settings: { id: INSTALLATION_ID, workspace_id: WORKSPACE_ID, status: "active", plan_people: 100, over_plan: "refuse", max_people: null, monthly_cap_nanos: 100_000_000_000, answers_per_person_hour: 60, allow_guests: true, allow_external_users: false },
				slackUserId: "U0PERSON02", facts: { isBot: false, isExternal: false, isGuest: false }, eventId: "Ev0QUEUED01", now: NOW,
			});
			await expect(coordinator.enqueue({
				threadKey: turn.threadKey, eventId: "Ev0QUEUED01", installationId: INSTALLATION_ID, teamId: TEAM_ID, channel: turn.channel, threadTs: turn.threadTs,
				messageTs: "1792600000.009999", slackUserId: "U0PERSON02", kind: "mention", text: `<@${BOT_USER_ID}> me next`,
			}, NOW)).resolves.toMatchObject({ status: "queued" });
			await expect(runTurn(deps(askingAgent()), turn, step)).resolves.toEqual({ status: "answered" });
		});

		it("takes a reply in the thread from the person asked as their answer, and tells anyone else who writes that it's waiting", async () => {
			let turn!: TurnRef;
			const agent = askingAgent({ after: async (request) => JSON.stringify(request.resume?.toolOutputs[0].output) });
			const inThread = (user: string, text: string, eventId: string, ts: string) =>
				processEvent(world.deps, hostedApp(world.env)!, eventEnvelope(mention({ user, text, ts, thread_ts: turn.threadTs, event_ts: ts }), { event_id: eventId }) as SlackEnvelope);
			step.onWait = async () => {
				await expect(inThread("U0PERSON02", `<@${BOT_USER_ID}> can I ask something?`, "Ev0OTHER001", "1792600050.000100")).resolves.toBe("queued");
				// Queued behind the question: its place is kept as long as the question's, past the meter's usual 30 minutes.
				expect(meter().usage(NOW + 45 * 60_000).pending).toBe(2);
				await expect(inThread("U0PERSON01", `<@${BOT_USER_ID}> Germany, please`, "Ev0REPLY001", "1792600050.000200")).resolves.toBe("answered_question");
				return "event";
			};
			turn = await startTurn();
			await runTurn(deps(agent), turn, step);
			expect(world.slack.of("chat.startStream").at(-1)?.args.markdown_text).toBe(JSON.stringify({ answered: true, answer: "Germany, please", in_their_own_words: true }));
			expect(world.slack.ephemerals().map((call) => [call.args.user, call.args.text])).toEqual([
				["U0PERSON02", "I'm waiting for <@U0PERSON01> to answer my question in this thread. I'll answer you after that."],
			]);
			expect(questionUpdates().at(-1)?.args.text).toBe("Which region?\n<@U0PERSON01> answered in the thread: Germany, please");
			// Their reply wasn't a new answer: one counted, and only the other person's message holds a place.
			expect(meter().usage(NOW)).toMatchObject({ people: 2, answers: 1, pending: 1 });
		});

		it("opens a form for their own words with Other, and continues from what they wrote", async () => {
			let turn!: TurnRef;
			const agent = askingAgent({
				question: { question: "Which region?", options: ["EU", "US"], allow_other: true },
				after: async (request) => JSON.stringify(request.resume?.toolOutputs[0].output),
			});
			step.onWait = async () => {
				await expect(click(turn, "U0PERSON02", "other")).resolves.toBe("refused");
				await expect(click(turn, "U0PERSON01", "other")).resolves.toBe("form_opened");
				const [opened] = world.slack.of("views.open");
				const view = opened.args.view as { callback_id: string; private_metadata: string };
				expect(opened.args.trigger_id).toBe("1337.42.abcdef");
				expect(view).toMatchObject({ type: "modal", callback_id: "question_other", private_metadata: `C0CHANNEL1|${turn.threadTs}|${turn.turnId}|1` });
				await expect(handleInteraction(world.deps, hostedApp(world.env)!, {
					type: "view_submission",
					api_app_id: HOSTED_APP_ID,
					team: { id: TEAM_ID },
					user: { id: "U0PERSON01", team_id: TEAM_ID },
					view: { callback_id: "question_other", private_metadata: view.private_metadata, state: { values: { answer: { answer: { value: "Somewhere in <Asia>" } } } } },
				})).resolves.toBe("answered");
				return "event";
			};
			turn = await startTurn();
			await runTurn(deps(agent), turn, step);
			const [question] = world.slack.of("chat.postMessage");
			expect(JSON.stringify(question.args.blocks)).toContain("\"action_id\":\"question_other\"");
			expect(context(question)).toContain("You can also reply in this thread.");
			expect(world.slack.of("chat.startStream").at(-1)?.args.markdown_text).toBe(JSON.stringify({ answered: true, answer: "Somewhere in <Asia>", in_their_own_words: true }));
			// Their words are shown as they wrote them, not as Slack markup.
			expect(questionUpdates().at(-1)?.args.text).toBe("Which region?\n<@U0PERSON01> answered: Somewhere in &lt;Asia&gt;");
			expect(world.slack.ephemerals().map((call) => call.args.text)).toEqual(["Only <@U0PERSON01> can answer this question."]);
		});

		it("doesn't run the model after the answer when the run before the question used the whole limit", async () => {
			let turn!: TurnRef;
			const agent = askingAgent({ costs: [0.5, 0] });
			step.onWait = async () => {
				await click(turn, "U0PERSON01", 0);
				return "event";
			};
			turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
			expect(agent.requests).toHaveLength(1);
			expect(world.slack.of("chat.startStream").at(-1)?.args.markdown_text).toBe("_I stopped here to keep this answer within its $0.50 cost limit._");
			expect(world.slack.of("chat.stopStream").at(-1)?.args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: mrkdwnFooter(turn, "$0.5000", "Auto") }] }]);
			expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		});

		it("ends the answer with a private note when the question can't be posted", async () => {
			world.slack.failures.set("chat.postMessage", ["channel_not_found", "channel_not_found", "channel_not_found", "channel_not_found"]);
			const agent = askingAgent();
			const turn = await startTurn();
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "failed" });
			expect(step.waits).toEqual([]);
			expect(world.slack.ephemerals().map((call) => call.args.text)).toEqual(["Sorry, something went wrong while I was answering. Please try again."]);
			expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		});
	});

	it("ends the turn with a private reply when the run step fails outright", async () => {
		const agent = new ScriptedAgent(async () => answer());
		const turn = await startTurn();
		// Every attempt dies after the model answered, before anything was written to Slack.
		coordinatorOf(turn).stageTurnOutput = () => {
			throw new Error("storage_unavailable");
		};
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "failed" });
		expect(step.failures).toEqual([{ name: "run", attempt: 1 }, { name: "run", attempt: 2 }]);
		expect(world.slack.ephemerals().map((call) => call.args)).toEqual([
			{ channel: "C0CHANNEL1", user: "U0PERSON01", text: "Sorry, something went wrong while I was answering. Please try again." },
		]);
		expect(world.slack.of("agents.sessions.setStatus").map((call) => call.args.status)).toEqual(["processing", "active"]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		expect(coordinatorOf(turn).status().running).toBeNull();
	});
});

describe("Files in the thread", () => {
	const ALL_SCOPES = [...ORIGINAL_BOT_SCOPES, "files:read", "files:write"];
	/** A PNG's signature and IHDR start: enough for the type checks. */
	const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
	const PDF = new TextEncoder().encode("%PDF-1.7\n%test\n");

	function shareFile(id: string, name: string, mimetype: string, bytes: Uint8Array, extra: Record<string, unknown> = {}) {
		const url = `https://files.slack.com/files-pri/${TEAM_ID}-${id}/download/${encodeURIComponent(name)}`;
		world.slack.files.set(id, { info: { id, name, mimetype, size: bytes.byteLength, url_private_download: url, mode: "hosted", ...extra }, bytes });
		return url;
	}

	/** An agent that runs one tool from its request, as the model would call it, then answers. */
	class ToolAgent extends ScriptedAgent {
		images: ImageRequest[] = [];
		constructor(script: Script, private readonly image: GeneratedImage | null = null) {
			super(script);
		}
		async generateImage(request: ImageRequest): Promise<GeneratedImage> {
			this.images.push(request);
			if (!this.image) throw new AgentGatewayError({ status: 402, statusText: "Payment Required", body: { error: "insufficient_credits" }, message: "No credits" });
			return this.image;
		}
	}

	function callTool(request: AgentTurnRequest, id: string, input: unknown) {
		const tool = request.tools.find((entry) => entry.id === id);
		if (!tool || typeof tool.execute !== "function") throw new Error(`no ${id} tool`);
		return tool.execute(input, { runId: "run", agentId: "agent", stepIndex: 0, context: undefined, toolCall: { id: "call", name: id, input }, emitProgress: () => undefined, setContext: () => undefined } as never);
	}

	it("offers charts and images only once Slack granted files:write, and otherwise says what an admin can do", async () => {
		const agent = new ToolAgent(async () => answer());
		await runTurn(deps(agent), await startTurn(), step);
		expect(agent.requests[0].tools.map((tool) => tool.id)).not.toContain("make_chart");
		expect(agent.requests[0].tools.map((tool) => tool.id)).not.toContain("generate_image");
		expect(agent.requests[0].instructions).toContain("You can't post charts or images in this Slack workspace yet. If someone asks for one, say an admin needs to update the Phaseo agent's Slack permissions in Phaseo (Settings → Slack)");

		await install({ bot_scopes: ALL_SCOPES });
		await runTurn(deps(agent), await startTurn(), step);
		expect(agent.requests[1].tools.map((tool) => tool.id)).toEqual(expect.arrayContaining(["make_chart", "generate_image"]));
		expect(agent.requests[1].instructions).toContain("You can post a chart of numbers in the thread with make_chart, and an image you make with generate_image.");
		expect(agent.requests[1].instructions).not.toContain("can't post charts");
	});

	it("draws a chart the model asks for and posts it in the thread", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		let result: unknown;
		const agent = new ToolAgent(async (request) => {
			result = await callTool(request, "make_chart", { type: "bar", title: "Weekly spend", labels: ["Oct 5", "Oct 12"], series: [{ name: "Spend", values: [12.5, 40] }], value_prefix: "$" });
			return answer();
		});
		const turn = await startTurn();
		await runTurn(deps(agent), turn, step);
		expect(result).toEqual({ posted: true, file: "weekly-spend.png" });
		const [url] = world.slack.of("files.getUploadURLExternal");
		expect(url.args).toMatchObject({ filename: "weekly-spend.png", alt_txt: "Bar chart: Weekly spend. Spend: Oct 5 $12.5, Oct 12 $40." });
		const png = world.slack.uploads.get("F0UPLOAD001")!;
		expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
		expect(url.args.length).toBe(png.byteLength);
		const [complete] = world.slack.of("files.completeUploadExternal");
		expect(complete.args).toEqual({ files: JSON.stringify([{ id: "F0UPLOAD001", title: "Weekly spend" }]), channel_id: "C0CHANNEL1", thread_ts: turn.threadTs });
		// The thread's working memory says what was posted.
		expect(coordinatorOf(turn).workingMemory().filter((entry) => entry.kind === "tool").map((entry) => entry.text)).toEqual(['make_chart: posted a bar chart, "Weekly spend"']);
	});

	it("tells the model what to fix in a chart, without posting anything", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		let failure: unknown;
		const agent = new ToolAgent(async (request) => {
			failure = await callTool(request, "make_chart", { type: "pie", title: "Share", labels: ["A", "B"], series: [{ name: "Share", values: [3, -1] }] }).catch((error: unknown) => error);
			return answer();
		});
		await runTurn(deps(agent), await startTurn(), step);
		expect(String(failure)).toContain("pie slices can't be negative");
		expect(world.slack.of("files.getUploadURLExternal")).toHaveLength(0);
	});

	it("makes an image with the installation's key, posts it, and counts its cost in the answer", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		let result: unknown;
		const agent = new ToolAgent(async (request, hooks) => {
			result = await callTool(request, "generate_image", { prompt: "A lighthouse at dusk, watercolour", size: "landscape" });
			await hooks.onText("Here's your lighthouse.");
			return { ...answer(), costUsd: 0.01 + request.otherCostUsd!() };
		}, { bytes: PNG, mimeType: "image/png", costUsd: 0.042, model: "openai/gpt-image-2" });
		const turn = await startTurn();
		await runTurn(deps(agent), turn, step);
		expect(result).toEqual({ posted: true, cost_usd: 0.042 });
		expect(agent.images).toEqual([{
			gatewayKey: GATEWAY_KEY, model: "openai/gpt-image-2", prompt: "A lighthouse at dusk, watercolour", size: "1536x1024",
			endUser: `slack:${TEAM_ID}:U0PERSON01`, sessionId: `slack-${turn.eventId}`, labels: { slackTeam: TEAM_ID, slackChannel: "C0CHANNEL1" },
			signal: expect.any(AbortSignal), zeroDataRetention: expect.any(Function),
		}]);
		expect(world.slack.of("files.getUploadURLExternal")[0].args).toMatchObject({ filename: "image.png", alt_txt: "Generated image: A lighthouse at dusk, watercolour" });
		expect(world.slack.uploads.get("F0UPLOAD001")).toEqual(PNG);
		// The image's cost is part of the answer's: in the run's cost and the footer's total.
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "answered", costNanos: 52_000_000 });
		expect(JSON.stringify(world.slack.of("chat.stopStream").map((call) => call.args))).toContain("$0.0520");
	});

	it("passes on why an image couldn't be made, and counts nothing for it", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		let result: unknown;
		const agent = new ToolAgent(async (request) => {
			result = await callTool(request, "generate_image", { prompt: "A cat" });
			return { ...answer(), costUsd: 0.01 + request.otherCostUsd!() };
		});
		await runTurn(deps(agent), await startTurn(), step);
		expect(result).toEqual({ posted: false, error: "This Phaseo workspace is out of credits, so no image could be made." });
		expect(world.slack.of("files.getUploadURLExternal")).toHaveLength(0);
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ costNanos: 10_000_000 });
	});

	it("reads the images and PDFs shared with the message and sends them to the model, keeping nothing of them", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		const imageUrl = shareFile("F0IMAGE001", "latency.png", "image/png", PNG);
		const pdfUrl = shareFile("F0PDF00001", "invoice.pdf", "application/pdf", PDF);
		const agent = new ScriptedAgent(async () => answer());
		const turn = await startTurn({ files: [{ id: "F0IMAGE001", name: "latency.png" }, { id: "F0PDF00001", name: "invoice.pdf" }] });
		await runTurn(deps(agent), turn, step);
		expect(world.slack.downloads).toEqual([imageUrl, pdfUrl]);
		const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
		expect(agent.requests[0].attachments).toEqual([
			{ type: "input_image", image_url: `data:image/png;base64,${base64(PNG)}` },
			{ type: "input_file", filename: "invoice.pdf", file_data: `data:application/pdf;base64,${base64(PDF)}` },
		]);
		expect(agent.requests[0].prompt).toContain([
			"Files shared in this thread, newest first:",
			"- latency.png from <@U0PERSON01>, in the new message: attached after this text.",
			"- invoice.pdf from <@U0PERSON01>, in the new message: attached after this text.",
		].join("\n"));
		// Step outputs hold ids and statuses only.
		expect(JSON.stringify(step.outputs)).not.toContain(base64(PNG));
		expect(JSON.stringify(step.outputs)).not.toContain("latency.png");
	});

	it("never asks Slack for files without files:read, and says an admin can allow it", async () => {
		const agent = new ScriptedAgent(async () => answer());
		await runTurn(deps(agent), await startTurn({ files: [{ id: "F0IMAGE001", name: "latency.png" }] }), step);
		expect(world.slack.of("files.info")).toHaveLength(0);
		expect(world.slack.downloads).toEqual([]);
		expect(agent.requests[0].attachments).toBeUndefined();
		expect(agent.requests[0].prompt).toContain("- latency.png from <@U0PERSON01>, in the new message: you can't open files here yet: an admin needs to update the Phaseo agent's Slack permissions in Phaseo (Settings → Slack).");
	});

	it("skips files the model can't read, types it can't read and anything that isn't what it claims, without downloading them", async () => {
		await install({ bot_scopes: ALL_SCOPES, model: "openai/gpt-test" });
		world.db.tables.v2_models = [{ model_slug: "openai/gpt-test", name: "GPT Test", hidden: false, input_modalities: ["text"] }];
		shareFile("F0IMAGE001", "latency.png", "image/png", PNG);
		shareFile("F0SHEET001", "budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", new Uint8Array([0x50, 0x4b, 3, 4]));
		const agent = new ScriptedAgent(async () => answer());
		await runTurn(deps(agent), await startTurn({ files: [{ id: "F0IMAGE001", name: "latency.png" }, { id: "F0SHEET001", name: "budget.xlsx" }] }), step);
		expect(world.slack.downloads).toEqual([]);
		expect(agent.requests[0].attachments).toBeUndefined();
		expect(agent.requests[0].prompt).toContain("- latency.png from <@U0PERSON01>, in the new message: the model answering can't read this kind of file.");
		expect(agent.requests[0].prompt).toContain("- budget.xlsx from <@U0PERSON01>, in the new message: you can only read images (PNG, JPEG, GIF, WebP) and PDFs.");

		// A model that reads images gets them; a file that says it's an image but isn't is left out.
		world.db.tables.v2_models = [{ model_slug: "openai/gpt-test", name: "GPT Test", hidden: false, input_modalities: ["text", "image"] }];
		shareFile("F0FAKE0001", "photo.png", "image/png", new TextEncoder().encode("<!DOCTYPE html><html>Sign in</html>"));
		await runTurn(deps(agent), await startTurn({ files: [{ id: "F0FAKE0001", name: "photo.png" }] }), step);
		expect(agent.requests[1].attachments).toBeUndefined();
		expect(agent.requests[1].prompt).toContain("- photo.png from <@U0PERSON01>, in the new message: Slack didn't let you read it.");
	});

	it("answers without the files, and says so, when no route of the model reads them", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		shareFile("F0IMAGE001", "latency.png", "image/png", PNG);
		const agent = new ScriptedAgent(async (_request, hooks, call) => {
			if (call === 1) throw new AgentGatewayError({ status: 400, statusText: "Bad Request", body: { error: "unsupported_modalities", reason: "unsupported_modalities" }, message: "unsupported" });
			await hooks.onText("I can't see the image with this model.");
			return answer();
		});
		await expect(runTurn(deps(agent), await startTurn({ files: [{ id: "F0IMAGE001", name: "latency.png" }] }), step)).resolves.toEqual({ status: "answered" });
		expect(agent.requests).toHaveLength(2);
		expect(agent.requests[0].attachments).toHaveLength(1);
		expect(agent.requests[1].attachments).toBeUndefined();
		expect(agent.requests[1].prompt).toContain("- latency.png from <@U0PERSON01>, in the new message: the model answering can't read this kind of file.");
	});

	it("doesn't start the answer again without the files once a model response came back: tools may have run", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		shareFile("F0IMAGE001", "latency.png", "image/png", PNG);
		const agent = new ScriptedAgent(async (_request, hooks) => {
			hooks.onCost?.(0.01);
			throw new AgentGatewayError({ status: 400, statusText: "Bad Request", body: { error: "unsupported_modalities", reason: "unsupported_modalities" }, message: "unsupported" });
		});
		await expect(runTurn(deps(agent), await startTurn({ files: [{ id: "F0IMAGE001", name: "latency.png" }] }), step)).resolves.toEqual({ status: "failed" });
		expect(agent.requests).toHaveLength(1);
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "failed", error: "files_unsupported" });
	});

	it("tells a retried run what the answer already posted, and counts its images toward the answer's limit", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		let turn!: TurnRef;
		const results: unknown[] = [];
		const agent = new ToolAgent(async (request, _hooks, call) => {
			if (call === 1) {
				results.push(await callTool(request, "generate_image", { prompt: "A fox" }));
				// The step dies at its end, after the image was posted and paid for.
				const coordinator = coordinatorOf(turn);
				const stage = coordinator.stageTurnOutput.bind(coordinator);
				coordinator.stageTurnOutput = () => {
					coordinator.stageTurnOutput = stage;
					throw new Error("storage_unavailable");
				};
				return { ...answer(), costUsd: 0.01 + request.otherCostUsd!() };
			}
			expect(request.prompt).toContain([
				"Already posted in this thread while answering this message (an earlier try stopped part way); don't post them again:",
				'- image: "A fox"',
			].join("\n"));
			results.push(await callTool(request, "generate_image", { prompt: "A badger" }));
			results.push(await callTool(request, "generate_image", { prompt: "A heron" }));
			return answer();
		}, { bytes: PNG, mimeType: "image/png", costUsd: 0.04, model: "openai/gpt-image-2" });
		turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(step.failures).toEqual([{ name: "run", attempt: 1 }]);
		expect(results).toEqual([
			{ posted: true, cost_usd: 0.04 },
			{ posted: true, cost_usd: 0.04 },
			{ posted: false, error: expect.stringContaining("You've made 2 images in this answer") },
		]);
		expect(agent.images.map((image) => image.prompt)).toEqual(["A fox", "A badger"]);
	});

	it("reads the files shared with an answer to its question in the run after it", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		shareFile("F0REPORT01", "report.pdf", "application/pdf", PDF);
		const paused = { run: { id: "run_q", status: "waiting_for_human", messages: [] }, steps: [], stepResults: [], messages: [], items: [] } as unknown as PausedRun;
		let turn!: TurnRef;
		const agent = new ScriptedAgent(async (request, hooks) => {
			if (request.resume) return answer();
			await hooks.onStep({ costUsd: 0.01 });
			const tool = request.tools.find((entry) => entry.id === "ask_question")!;
			await tool.onToolCalled!({ question: "Which report?", options: ["Q3", "Q4"] }, { stepIndex: 0, toolCall: { id: "call_q1", name: "ask_question", input: {} } } as never);
			return { costUsd: 0.01, model: "openai/gpt-test", stopReason: null, paused };
		});
		step.onWait = async () => {
			// Their reply in the thread, with the file: the answer to the question.
			const ts = "1792600050.000200";
			const reply = mention({ text: `<@${BOT_USER_ID}> This one`, ts, thread_ts: turn.threadTs, event_ts: ts, files: [{ id: "F0REPORT01", name: "report.pdf", mimetype: "application/pdf" }] });
			await expect(processEvent(world.deps, hostedApp(world.env)!, eventEnvelope(reply, { event_id: "Ev0REPLY001" }) as SlackEnvelope)).resolves.toBe("answered_question");
			return "event";
		};
		turn = await startTurn();
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(agent.requests[0].attachments).toBeUndefined();
		expect(agent.requests[1].attachments).toEqual([{ type: "input_file", filename: "report.pdf", file_data: `data:application/pdf;base64,${btoa(String.fromCharCode(...PDF))}` }]);
		expect(agent.requests[1].resume?.toolOutputs).toEqual([{
			toolCallId: "call_q1",
			output: { answered: true, answer: "This one", in_their_own_words: true, files: ["- report.pdf from <@U0PERSON01>, in the new message: attached after this text."] },
		}]);
	});

	it("reads files people shared in the thread messages it read, never the agent's own", async () => {
		await install({ bot_scopes: ALL_SCOPES });
		const threadTs = "1792600000.000050";
		shareFile("F0IMAGE001", "dashboard.png", "image/png", PNG);
		shareFile("F0CHART001", "weekly-spend.png", "image/png", PNG);
		world.slack.replies = [
			{ ts: threadTs, user: "U0PERSON02", text: "Here's the dashboard", files: [{ id: "F0IMAGE001", name: "dashboard.png", mimetype: "image/png" }] },
			{ ts: "1792600000.000060", bot_id: "B0BOT00001", user: BOT_USER_ID, text: "", files: [{ id: "F0CHART001", name: "weekly-spend.png", mimetype: "image/png" }] },
			{ ts: "1792600000.000070", user: "U0PERSON01", text: "what's wrong in it?" },
		];
		const agent = new ScriptedAgent(async () => answer());
		await runTurn(deps(agent), await startTurn({ threadTs, messageTs: "1792600000.000070", text: "what's wrong in it?" }), step);
		expect(world.slack.of("files.info").map((call) => call.args.file)).toEqual(["F0IMAGE001"]);
		expect(agent.requests[0].attachments).toHaveLength(1);
		expect(agent.requests[0].prompt).toContain("<@U0PERSON02>: Here's the dashboard (shared dashboard.png)");
		expect(agent.requests[0].prompt).toContain("You (Phaseo agent): (shared weekly-spend.png)");
		expect(agent.requests[0].prompt).toContain("- dashboard.png from <@U0PERSON02>, earlier in the thread: attached after this text.");
	});
});

describe("Slack search", () => {
	const SEARCH_SCOPES = [...ORIGINAL_BOT_SCOPES, "search:read.public", "search:read.files"];
	const TOKEN = "7310092.18.0c9f5a6d2e8bTOKEN";
	const SNIPPET = "We ship the launch plan on Friday.";
	const RESPONSE = {
		results: {
			messages: [{ author_name: "Ada Lovelace", author_user_id: "U0ADA00001", channel_id: "C0LAUNCH01", channel_name: "launch", message_ts: "1792500000.000100", content: SNIPPET, permalink: "https://acme.slack.com/archives/C0LAUNCH01/p1792500000000100" }],
			files: [],
		},
		response_metadata: { next_cursor: "" },
	};
	const DIRECT = { channel: "D0DIRECT01", kind: "dm" as const };
	/** A model with a provider that keeps no data, which an answer that searches Slack needs (seeded below). */
	const ZDR_MODEL = "openai/gpt-test";

	/** A catalogue route the gateway routes to, and its provider: by default one that keeps no data and doesn't train on prompts. */
	function catalogueRoute(model: string, provider: string, overrides: Record<string, unknown> = {}) {
		(world.db.tables.v2_model_provider_routes ??= []).push({ model_slug: model, provider_slug: provider, routing_enabled: true, status: "active", effective_from: "2026-01-01T00:00:00Z", effective_to: null });
		(world.db.tables.v2_providers ??= []).push({
			provider_slug: provider, status: "active", routing_enabled: true, zero_data_retention: true,
			data_policy_tier: "private", data_policy_confidence: "confirmed", prompt_training_policy: "no_train", ...overrides,
		});
	}

	beforeEach(() => {
		world.db.tables.v2_model_provider_routes = [];
		world.db.tables.v2_providers = [];
		catalogueRoute(ZDR_MODEL, "zdr-cloud");
	});

	function callTool(request: AgentTurnRequest, id: string, input: unknown) {
		const tool = request.tools.find((entry) => entry.id === id);
		if (!tool || typeof tool.execute !== "function") throw new Error(`no ${id} tool`);
		return tool.execute(input, { runId: "run", agentId: "agent", stepIndex: 0, context: undefined, toolCall: { id: "call", name: id, input }, emitProgress: () => undefined, setContext: () => undefined } as never);
	}

	/** Every value the thread's coordinator holds, as text. */
	function stored(turn: TurnRef): string {
		const storage = storageOf(coordinatorOf(turn));
		return JSON.stringify(storage.tables().map((table) => storage.db.prepare(`SELECT * FROM ${table}`).all()));
	}

	it("is offered with the search scope, the admins' permission and the message's action token, and otherwise the model is told why not", async () => {
		const agent = new ScriptedAgent(async () => answer());
		const turnWith = async (overrides: Partial<TurnRequest>) => {
			await runTurn(deps(agent), await startTurn(overrides), step);
			const request = agent.requests.at(-1)!;
			return { tools: request.tools.map((tool) => tool.id), instructions: request.instructions };
		};

		// Installed before search: no scope yet.
		expect(await turnWith({ ...DIRECT, actionToken: TOKEN })).toMatchObject({ tools: expect.not.arrayContaining(["search_slack"]), instructions: expect.stringContaining("You can't search Slack messages in this Slack workspace yet. If asked to, say an admin needs to update the Phaseo agent's Slack permissions") });

		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		const direct = await turnWith({ ...DIRECT, actionToken: TOKEN });
		expect(direct.tools).toContain("search_slack");
		expect(direct.instructions).toContain("You can search this Slack workspace's public channels with search_slack. It searches as <@U0PERSON01>, so it finds only what they can see in Slack.");
		expect(direct.instructions).not.toContain("Everyone in this conversation reads your answer");
		// No token: a guest, or a message that didn't carry one.
		expect(await turnWith(DIRECT)).toMatchObject({ tools: expect.not.arrayContaining(["search_slack"]), instructions: expect.stringContaining("Slack lets you search only for members of the workspace (not guests)") });
		// Direct messages only, by default.
		expect(await turnWith({ actionToken: TOKEN })).toMatchObject({ tools: expect.not.arrayContaining(["search_slack"]), instructions: expect.stringContaining("You can only search Slack messages in a direct message with you") });

		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES, search_mode: "dm_and_channels" });
		const channel = await turnWith({ actionToken: TOKEN });
		expect(channel.tools).toContain("search_slack");
		expect(channel.instructions).toContain("Everyone in this conversation reads your answer, so share only what the question needs and link to the rest.");
		expect(await turnWith({ actionToken: TOKEN, external: true })).toMatchObject({ tools: expect.not.arrayContaining(["search_slack"]), instructions: expect.stringContaining("You can't search Slack messages for people from other organisations.") });

		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES, search_mode: "off" });
		expect(await turnWith({ ...DIRECT, actionToken: TOKEN })).toMatchObject({ tools: expect.not.arrayContaining(["search_slack"]), instructions: expect.stringContaining("an admin has turned Slack search off") });
	});

	it("is offered only when a provider that keeps no data can serve the model, and otherwise the model is told what would", async () => {
		const agent = new ScriptedAgent(async () => answer());
		const turnWith = async (overrides: Partial<TurnRequest> = {}) => {
			await runTurn(deps(agent), await startTurn({ ...DIRECT, actionToken: TOKEN, ...overrides }), step);
			const request = agent.requests.at(-1)!;
			return { tools: request.tools.map((tool) => tool.id), instructions: request.instructions };
		};
		// Every provider of this model keeps data.
		catalogueRoute("anthropic/claude-test", "logs-cloud", { zero_data_retention: false, data_policy_tier: "logs" });
		await install({ model: "anthropic/claude-test", bot_scopes: SEARCH_SCOPES });
		const keeps = await turnWith();
		expect(keeps.tools).not.toContain("search_slack");
		expect(keeps.instructions).toContain("You can't search Slack messages with Claude Test: Slack's terms don't allow keeping what its search finds, so an answer that searches Slack may only use AI providers that keep no data (zero data retention), and Claude Test has no provider that does.");
		expect(keeps.instructions).toContain("an admin can choose a model that keeps no data for the agent in Phaseo (Settings → Slack)");

		// Auto picks a model per request without regard to that. With model choice on, the allowed models that can search are named.
		await install({ model: "phaseo/auto", bot_scopes: SEARCH_SCOPES, model_choice_enabled: true, allowed_models: [ZDR_MODEL, "anthropic/claude-test"] });
		const auto = await turnWith();
		expect(auto.tools).not.toContain("search_slack");
		expect(auto.instructions).toContain("You can't search Slack messages with Auto:");
		expect(auto.instructions).toContain("by starting the message with `with <model>:` (GPT Test), or an admin can choose one for the agent");
		// Chosen for the message, a model that keeps no data can search.
		expect((await turnWith({ model: ZDR_MODEL })).tools).toContain("search_slack");
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		const offered = await turnWith();
		expect(offered.tools).toContain("search_slack");
		expect(offered.instructions).toContain("after a search every model request of the answer goes only to AI providers that keep no data (zero data retention)");
	});

	it("sends every model request from the first search on only to providers that keep no data: its own and the models it asks", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES, model_choice_enabled: true, allowed_models: [ZDR_MODEL, "anthropic/claude-test"] });
		world.slack.searchResponse = RESPONSE;
		const noZdrRoute = { error: { code: "model_region_unavailable", message: "This model has no provider that offers zero data retention." }, code: "model_region_unavailable" };
		const flags: Array<[string, boolean]> = [];
		const consults: unknown[] = [];
		const agent = new ScriptedAgent(async (request, hooks) => {
			// Before the search: anywhere the guardrail allows.
			flags.push(["step 1", await request.zeroDataRetention!()]);
			consults.push(await callTool(request, "ask_model", { model: "anthropic/claude-test", prompt: "Is Friday a good launch day?" }));
			await callTool(request, "search_slack", { query: "launch plan" });
			// The request that carries the results, and every one after it.
			flags.push(["step 2", await request.zeroDataRetention!()]);
			consults.push(await Promise.resolve(callTool(request, "ask_model", { model: "anthropic/claude-test", prompt: "Summarise the launch plan." })).catch((caught: Error) => caught.message));
			flags.push(["step 3", await request.zeroDataRetention!()]);
			await hooks.onText("It ships on Friday.");
			return answer();
		}, async (request, call) => {
			flags.push([`consult ${call}`, await request.zeroDataRetention!()]);
			if (call === 2) throw new AgentGatewayError({ status: 403, statusText: "Forbidden", body: noZdrRoute });
			return { text: "Yes.", costUsd: 0.01 };
		});
		await expect(runTurn(deps(agent), await startTurn({ ...DIRECT, actionToken: TOKEN }), step)).resolves.toEqual({ status: "answered" });
		expect(flags).toEqual([["step 1", false], ["consult 1", false], ["step 2", true], ["consult 2", true], ["step 3", true]]);
		expect(consults).toEqual([
			expect.objectContaining({ answer: "Yes." }),
			"Claude Test can't be used after a Slack search: once an answer has searched Slack, it may only use AI providers that keep no data (zero data retention), and Claude Test has none. Answer without it, and say so if they asked for it.",
		]);
		// One function for the whole answer: the runner asks it before each request (agent.ts adds the flag).
		expect(agent.asks.map((ask) => ask.zeroDataRetention)).toEqual([agent.requests[0].zeroDataRetention, agent.requests[0].zeroDataRetention]);
	});

	it("ends the answer saying why, and counts what it cost, when no provider that keeps no data can answer after a search", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		const body = { error: { code: "model_region_unavailable", message: "This model has no provider that offers zero data retention.", type: "permission_error" }, code: "model_region_unavailable" };
		const agent = new ScriptedAgent(async (request, hooks) => {
			hooks.onCost?.(0.004);
			await callTool(request, "search_slack", { query: "launch plan" });
			await hooks.onText("Let me look. ");
			throw new AgentGatewayError({ status: 403, statusText: "Forbidden", body });
		});
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		const turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
		try {
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "failed" });
		} finally {
			errors.mockRestore();
		}
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toMatchObject({ status: "failed", error: "search_needs_zdr", costNanos: 4_000_000 });
		const written = JSON.stringify(world.slack.calls.filter((call) => call.method.startsWith("chat.")).map((call) => call.args));
		expect(written).toContain("I stopped here: after a Slack search, I can only use AI providers that keep no data (zero data retention), and none could answer with this agent's model.");
		expect(written).not.toContain("Sorry, something went wrong");
		expect(stored(turn)).not.toContain(SNIPPET);
	});

	it("searches as the person and keeps nothing it found: not in step outputs, working memory, the coordinator or the Workflow's payload", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		const agent = new ScriptedAgent(async (request, hooks) => {
			const found = await callTool(request, "search_slack", { query: "launch plan" }) as { messages: Array<{ text: string; link: string; channel: string }> };
			expect(found.messages).toEqual([expect.objectContaining({ text: SNIPPET, channel: "<#C0LAUNCH01|launch>" })]);
			await hooks.onText(`The launch plan ships on Friday (<${found.messages[0].link}|#launch>).`);
			return answer();
		});
		const turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
		expect(JSON.stringify(turn)).not.toContain(TOKEN);
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });

		expect(world.slack.of("assistant.search.context")).toEqual([{ token: BOT_TOKEN, method: "assistant.search.context", args: expect.objectContaining({ query: "launch plan", action_token: TOKEN, channel_types: "public_channel", content_types: "messages,files" }) }]);
		const outputs = JSON.stringify(step.outputs);
		for (const value of [TOKEN, SNIPPET, "Ada Lovelace"]) {
			expect(outputs).not.toContain(value);
			expect(stored(turn)).not.toContain(value);
		}
		// Its own answer is a message in the thread like any other; the note names the query and the count.
		// The answer quotes what it found: working memory keeps only a note of it (the reply is in the thread).
		expect(coordinatorOf(turn).workingMemory().map((entry) => entry.text)).toEqual(["search_slack", SEARCHED_REPLY_MEMORY]);
	});

	function askQuestion(request: AgentTurnRequest, id = "call_q1") {
		const tool = request.tools.find((entry) => entry.id === "ask_question")!;
		return tool.onToolCalled!({ question: "Which launch?", options: ["Web", "Mobile"] }, { stepIndex: 0, toolCall: { id, name: "ask_question", input: {} } } as never);
	}

	/** A run paused at ask_question, holding `messages`. */
	function pausedAt(messages: unknown[]): AgentTurnOutput {
		const paused = {
			run: {
				id: "run_q", agentId: "phaseo-slack-agent", status: "waiting_for_human", input: null, stepCount: 1, createdAt: "2026-10-21T12:00:00.000Z", updatedAt: "2026-10-21T12:00:00.000Z",
				messages,
			},
			steps: [], stepResults: [], messages: [], items: [],
		} as unknown as PausedRun;
		return { costUsd: 0.01, model: "openai/gpt-test", stopReason: null, paused };
	}

	it("asks no question once the answer has searched, so no run holding results waits in the coordinator", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		const refusals: unknown[] = [];
		const agent = new ScriptedAgent(async (request, hooks) => {
			const found = await callTool(request, "search_slack", { query: "launch plan" });
			refusals.push(await askQuestion(request));
			await hooks.onText("The launch plan ships on Friday. Which launch did you mean, web or mobile?");
			expect(JSON.stringify(found)).toContain(SNIPPET);
			return answer();
		});
		const turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(refusals).toEqual([{ asked: false, error: expect.stringContaining("You searched Slack in this answer, so you can't ask a question") }]);
		expect(agent.requests[0].instructions).toContain("Slack's terms don't allow keeping anything its search finds, so once you've searched in an answer you can't ask a question with ask_question, save notes, pins, to-dos, skills or recurring tasks, or publish shared pages.");
		expect(step.waits).toEqual([]);
		expect(step.outputs.map((entry) => entry.name)).not.toContain("ask-1");
	});

	it("never holds a paused run for an answer that searched, should a search slip past the question", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		let turn!: TurnRef;
		const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
		try {
			const agent = new ScriptedAgent(async (request) => {
				expect(await askQuestion(request)).toBeNull();
				// A search the tools didn't stop (they do: see the next test).
				expect(await coordinatorOf(turn).reserveSearch(turn.turnId, 4)).toBe(true);
				return pausedAt([{ role: "user", content: "what's the launch plan?" }, { role: "tool", toolCallId: "call_s1", name: "search_slack", content: JSON.stringify({ found: true, messages: [{ text: SNIPPET }] }) }]);
			});
			turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
			await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "failed" });
			expect(errors.mock.calls).toContainEqual(["[slack-agent] paused run not kept", { turnId: turn.turnId, question: 1, afterSearch: true }]);
		} finally {
			errors.mockRestore();
		}
		expect(step.waits).toEqual([]);
		expect(stored(turn)).not.toContain(SNIPPET);
	});

	it("doesn't search in the step that asks a question, and searches after the answer with the answer's token", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		const ANSWER_TOKEN = "7310092.19.answerTOKEN";
		let turn!: TurnRef;
		const flags: boolean[] = [];
		const agent = new ScriptedAgent(async (request, hooks) => {
			flags.push(await request.zeroDataRetention!());
			if (!request.resume) {
				// The SDK takes a step's questions before it runs the step's other tools.
				expect(await askQuestion(request)).toBeNull();
				const refused = await callTool(request, "search_slack", { query: "launch plan" });
				expect(refused).toEqual({ found: false, error: expect.stringContaining("can't search Slack until they answer") });
				await hooks.onStep({ costUsd: 0.01 });
				return pausedAt([{ role: "user", content: "what's the launch plan?" }, { role: "tool", toolCallId: "call_s1", name: "search_slack", content: JSON.stringify(refused) }]);
			}
			const found = await callTool(request, "search_slack", { query: "web launch plan" });
			expect(JSON.stringify(found)).toContain(SNIPPET);
			// The resumed run's requests from here on keep no data.
			flags.push(await request.zeroDataRetention!());
			// Searched now: no more questions in this answer.
			expect(await askQuestion(request, "call_q2")).toMatchObject({ asked: false, error: expect.stringContaining("You searched Slack in this answer") });
			await hooks.onText("The web launch ships on Friday.");
			return answer();
		});
		step.onWait = async () => {
			expect(stored(turn)).not.toContain(SNIPPET);
			await expect(coordinatorOf(turn).answerWithMessage({ slackUserId: "U0PERSON01", text: "Web", actionToken: ANSWER_TOKEN, now: NOW })).resolves.toMatchObject({ status: "answered" });
			return "event";
		};
		turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(world.slack.of("assistant.search.context").map((call) => call.args.action_token)).toEqual([ANSWER_TOKEN]);
		// Before the question, and after it until the search: any provider; from the search on, only those that keep no data.
		expect(flags).toEqual([false, false, true]);
		expect(stored(turn)).not.toContain(SNIPPET);
		expect(stored(turn)).not.toContain("TOKEN");
	});

	it("saves no notes, skills or recurring tasks once the answer has searched", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		world.db.rpcResults.save_slack_agent_note = { status: "saved", note: { id: "00000000-0000-4000-8000-0000000000e1", kind: "note", channel_id: "D0DIRECT01", text: "Mobile ships later.", done_at: null, created_by: "U0PERSON01", created_at: "2026-10-21T12:00:00Z", expires_at: null } };
		world.db.rpcResults.save_slack_agent_skill = { status: "saved", skill: { name: "Launch notes", description: "x" } };
		const results: unknown[] = [];
		const agent = new ScriptedAgent(async (request, hooks) => {
			// Before a search, as ever.
			results.push(await callTool(request, "remember", { text: "Mobile ships later." }));
			await callTool(request, "search_slack", { query: "launch plan" });
			results.push(await callTool(request, "remember", { text: SNIPPET, kind: "pin" }));
			results.push(await callTool(request, "save_skill", { name: "Launch notes", description: "Where the launch stands", instructions: SNIPPET }));
			results.push(await callTool(request, "schedule_task", { title: "Launch digest", prompt: SNIPPET, frequency: "daily", time: "09:00" }));
			await hooks.onText("I can't save what Slack search finds.");
			return answer();
		});
		const turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		const refused = { saved: false, note: expect.stringContaining("you searched Slack in this answer") };
		expect(results).toEqual([expect.objectContaining({ saved: true }), refused, refused, refused]);
		expect(world.db.rpcs.filter((call) => call.fn.startsWith("save_")).map((call) => call.args.p_text ?? call.args.p_instructions)).toEqual(["Mobile ships later."]);
		expect(JSON.stringify(world.db.rpcs)).not.toContain(SNIPPET);
	});

	it("publishes no shared page once the answer has searched", async () => {
		world.env.PUBLIC_ORIGIN = "https://slack.phaseo.app";
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		const results: unknown[] = [];
		const agent = new ScriptedAgent(async (request, hooks) => {
			// Before a search, as ever.
			results.push(await callTool(request, "publish_page", { title: "Launch status", html: "<h1>Mobile ships later.</h1>" }));
			await callTool(request, "search_slack", { query: "launch plan" });
			results.push(await callTool(request, "publish_page", { title: "Launch plan", html: `<h1>Launch plan</h1><p>${SNIPPET}</p>` }));
			await hooks.onText("I can't put what Slack search finds on a page.");
			return answer();
		});
		const turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(results).toEqual([
			expect.objectContaining({ url: expect.stringMatching(/^https:\/\/slack\.phaseo\.app\/p\//), title: "Launch status" }),
			{ published: false, note: expect.stringContaining("you searched Slack in this answer") },
		]);
		const pages = world.pages.get(world.pages.idFromName(INSTALLATION_ID));
		expect((await pages.list(NOW)).map((page) => page.title)).toEqual(["Launch status"]);
		expect(JSON.stringify(storageOf(pages).db.prepare("SELECT * FROM pages").all())).not.toContain(SNIPPET);
	});

	it("makes at most 4 searches in an answer, however often its run starts again", async () => {
		await install({ model: ZDR_MODEL, bot_scopes: SEARCH_SCOPES });
		world.slack.searchResponse = RESPONSE;
		let turn!: TurnRef;
		const results: unknown[] = [];
		const flags: boolean[] = [];
		const agent = new ScriptedAgent(async (request, hooks, call) => {
			flags.push(await request.zeroDataRetention!());
			if (call === 1) {
				for (const query of ["one", "two", "three"]) results.push(await callTool(request, "search_slack", { query }));
				// The step dies at its end, after the searches.
				const coordinator = coordinatorOf(turn);
				const stage = coordinator.stageTurnOutput.bind(coordinator);
				coordinator.stageTurnOutput = () => {
					coordinator.stageTurnOutput = stage;
					throw new Error("storage_unavailable");
				};
				return answer();
			}
			// The retry has made no search itself, but the answer has.
			expect(await askQuestion(request)).toMatchObject({ asked: false, error: expect.stringContaining("You searched Slack in this answer") });
			for (const query of ["four", "five", "six"]) results.push(await callTool(request, "search_slack", { query }));
			await hooks.onText("Here's what I found.");
			return answer();
		});
		turn = await startTurn({ ...DIRECT, actionToken: TOKEN });
		await expect(runTurn(deps(agent), turn, step)).resolves.toEqual({ status: "answered" });
		expect(step.failures).toEqual([{ name: "run", attempt: 1 }]);
		expect(world.slack.of("assistant.search.context").map((entry) => entry.args.query)).toEqual(["one", "two", "three", "four"]);
		// The retried run's very first request keeps no data: the answer searched in the try before it.
		expect(flags).toEqual([false, true]);
		const limit = { found: false, error: "You've searched Slack 4 times in this answer, the most one answer may. Answer with what you found." };
		expect(results.slice(4)).toEqual([limit, limit]);
	});
});
