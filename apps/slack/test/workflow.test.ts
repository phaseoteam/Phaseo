import { AgentGatewayError } from "@phaseo/agent-sdk";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentRunner, AgentTurnHooks, AgentTurnOutput, AgentTurnRequest } from "../src/agent";
import { clearUserFactsCache } from "../src/access";
import type { TurnRequest } from "../src/coordinator";
import type { Installation } from "../src/installations";
import type { TurnRef } from "../src/turns";
import { runTurn, type StepConfig, type StepRunner, type TurnDeps } from "../src/workflow";
import { BOT_TOKEN, BOT_USER_ID, INSTALLATION_ID, installationRow, TEAM_ID, testWorld, WORKSPACE_ID, type TestWorld } from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const GATEWAY_KEY = "phaseo_v1_sk_testkid00000_testsecret";
const USER = "00000000-0000-4000-8000-0000000000d1";

/** Runs steps like Workflows does: retries up to the step's limit, and keeps outputs as JSON. */
class FakeStep implements StepRunner {
	outputs: Array<{ name: string; attempt: number; output: unknown }> = [];
	failures: Array<{ name: string; attempt: number }> = [];
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

class ScriptedAgent implements AgentRunner {
	requests: AgentTurnRequest[] = [];
	constructor(private readonly script: Script) {}
	async run(request: AgentTurnRequest, hooks: AgentTurnHooks) {
		this.requests.push(request);
		return this.script(request, hooks, this.requests.length);
	}
}

const answer = (model = "openai/gpt-test", costUsd = 0.0123): AgentTurnOutput => ({ costUsd, model, stopReason: null });

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
	const threadKey = `${INSTALLATION_ID}:${channel}:${threadTs}`;
	const coordinator = world.threads.get(world.threads.idFromName(threadKey));
	let started: TurnRef | null = null;
	coordinator.runner = { start: async (turn) => { started = turn; return { started: true }; } };
	const eventId = `Ev0WF${String(counter).padStart(4, "0")}`;
	world.meters.get(world.meters.idFromName(INSTALLATION_ID)).admit({
		settings: { id: INSTALLATION_ID, workspace_id: WORKSPACE_ID, status: "active", plan_people: 100, over_plan: "refuse", max_people: null, monthly_cap_nanos: 100_000_000_000, answers_per_person_hour: 60, allow_guests: true, allow_external_users: false },
		slackUserId: overrides.slackUserId ?? "U0PERSON01",
		facts: { isBot: false, isExternal: false, isGuest: false },
		eventId,
		now: NOW,
	});
	await coordinator.enqueue({
		threadKey, eventId, installationId: INSTALLATION_ID, teamId: TEAM_ID, channel, threadTs, messageTs,
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

beforeEach(async () => {
	world = testWorld({ now: NOW });
	step = new FakeStep();
	clearUserFactsCache();
	await install();
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
			["chat.stopStream", { channel: "C0CHANNEL1", ts: "1792600100.000001", blocks: [{ type: "context", elements: [{ type: "mrkdwn", text: "phaseo/auto → openai/gpt-test · $0.0123" }] }] }],
		]);
		expect(new Set(world.slack.calls.map((call) => call.token))).toEqual(new Set([BOT_TOKEN]));
		expect(meter().usage(NOW)).toMatchObject({ people: 1, answers: 1, pending: 0 });
		expect(coordinatorOf(turn).status()).toMatchObject({ running: null, queued: 0 });
		expect(coordinatorOf(turn).workingMemory()).toEqual([{ kind: "reply", text: "You spent $12.50 this week.", at: world.clock.now }]);

		// Step outputs are kept with the instance: ids and statuses only.
		expect(step.outputs.map((entry) => entry.name)).toEqual(["load", "context", "run", "reply", "finish"]);
		const stored = JSON.stringify(step.outputs);
		for (const secretOrText of ["spent", "what did we", GATEWAY_KEY, BOT_TOKEN]) expect(stored).not.toContain(secretOrText);
		expect(step.outputs.find((entry) => entry.name === "run")?.output).toEqual({ status: "answered", ts: "1792600100.000001", streamed: true, explained: true, costNanos: 12_300_000, model: "openai/gpt-test", error: null });
		expect(step.outputs.find((entry) => entry.name === "reply")?.output).toEqual({ shown: true, stopped: true });

		const [request] = agent.requests;
		expect(request).toMatchObject({
			gatewayKey: GATEWAY_KEY,
			model: "phaseo/auto",
			endUser: `slack:${TEAM_ID}:U0PERSON01`,
			labels: { slackTeam: TEAM_ID, slackChannel: "C0CHANNEL1" },
			tools: [],
		});
		expect(request.prompt).toBe("New message from <@U0PERSON01>:\nwhat did we spend this week?");
		expect(request.instructions).toContain("can't see this workspace's Phaseo usage");
	});

	it("passes the admins' instructions and model", async () => {
		await install({ model: "anthropic/claude-test", instructions: "Answer in French." });
		const agent = new ScriptedAgent(async () => answer("anthropic/claude-test"));
		await runTurn(deps(agent), await startTurn(), step);
		expect(agent.requests[0].model).toBe("anthropic/claude-test");
		expect(agent.requests[0].instructions).toMatch(/Instructions from this workspace's admins:\nAnswer in French\.$/);
	});

	it("offers usage tools only where usage_data_mode allows and to a linked member", async () => {
		const agent = new ScriptedAgent(async () => answer());
		const toolIds = () => agent.requests.at(-1)!.tools.map((tool) => tool.id);
		// A DM from someone who hasn't linked their account.
		await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
		expect(toolIds()).toEqual([]);
		// Linked, but no longer a member of the workspace.
		world.db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: USER });
		await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
		expect(toolIds()).toEqual([]);
		// A linked member, in a DM.
		world.db.tables.workspace_members.push({ workspace_id: WORKSPACE_ID, user_id: USER });
		await runTurn(deps(agent), await startTurn({ channel: "D0DIRECT01" }), step);
		expect(toolIds()).toEqual(["get_spend", "get_credit_balance", "get_key_usage", "find_models"]);
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
		await runTurn(deps(agent), await startTurn({ threadTs, messageTs: "1792600000.000070", text: "and this week?" }), step);
		expect(world.slack.of("conversations.replies")[0].args).toEqual({ channel: "C0CHANNEL1", ts: threadTs, limit: 15 });
		expect(agent.requests[0].prompt).toBe([
			"Earlier messages in this Slack thread, oldest first:",
			"<@U0PERSON02>: how much last week?",
			"You (Phaseo agent): Last week was $30.00.",
			"",
			"New message from <@U0PERSON01>:",
			"and this week?",
		].join("\n"));
		expect(step.outputs.find((entry) => entry.name === "context")?.output).toEqual({ source: "replies", messages: 2 });

		world.slack.failures.set("conversations.replies", ["ratelimited"]);
		await runTurn(deps(agent), await startTurn({ threadTs, messageTs: "1792600000.000080", text: "thanks, and now?" }), step);
		expect(agent.requests[1].prompt).toBe([
			"Your earlier replies and lookups in this thread, oldest first:",
			"You (Phaseo agent): Spend was $40.00.",
			"",
			"New message from <@U0PERSON01>:",
			"thanks, and now?",
		].join("\n"));
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
			["chat.update", { channel: "C0CHANNEL1", ts: "1792600100.000001", markdown_text: "Part one, part two, part three.\n\n_phaseo/auto → openai/gpt-test · $0.0010_" }],
		]);
		// Stopping the stream also set the session back to active.
		expect(world.slack.of("agents.sessions.setStatus").map((call) => call.args.status)).toEqual(["processing"]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 1, pending: 0 });
		expect(coordinatorOf(turn).workingMemory()).toEqual([{ kind: "reply", text: "Part one, part two, part three.", at: world.clock.now }]);
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
			{ channel: "C0CHANNEL1", thread_ts: turn.threadTs, markdown_text: "Hello\n\n_phaseo/auto → openai/gpt-test · $0.0123_" },
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
		await expect(runTurn(deps(agent), await startTurn(), step)).resolves.toEqual({ status: "answered" });
		expect(step.failures).toEqual([{ name: "reply", attempt: 1 }]);
		expect(agent.requests).toHaveLength(1);
		expect(world.slack.of("chat.update").map((call) => call.args.markdown_text)).toEqual([
			"Answer\n\n_phaseo/auto → openai/gpt-test · $0.0123_",
			"Answer\n\n_phaseo/auto → openai/gpt-test · $0.0123_",
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
		expect(world.slack.of("chat.update").at(-1)?.args.markdown_text).toBe("Second try\n\n_phaseo/auto → openai/gpt-test · $0.4000_");
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
			"A long answer\n\n_I stopped here to keep this answer within its $0.50 cost limit._\n\n_phaseo/auto · $0.5000_",
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
		expect(world.slack.of("chat.stopStream")[0].args.blocks).toEqual([{ type: "context", elements: [{ type: "mrkdwn", text: "phaseo/auto · $0.0000" }] }]);
		expect(meter().usage(NOW)).toMatchObject({ answers: 0, pending: 0 });
		expect(coordinatorOf(turn).status()).toMatchObject({ running: null });
	});

	it("turns gateway errors into plain replies that are not counted", async () => {
		const cases: Array<[number, Record<string, unknown>, string]> = [
			[402, { error: { code: "insufficient_funds" } }, "This Phaseo workspace is out of credits, so I can't answer right now. An admin can add credits in Phaseo billing."],
			[429, { reason: "monthly_cost_limit_reached" }, "The Phaseo agent's monthly spending limit on its Phaseo key has been reached. An admin can raise it in Phaseo settings."],
			[404, { error: { code: "model_not_found" } }, "The model this agent uses isn't available right now. Please try again in a few minutes, or an admin can choose another model in Phaseo settings."],
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
