import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import {
	classifyTurnError,
	createSdkAgentRunner,
	gatewayBaseUrl,
	gatewayFetch,
	MAX_STEPS,
	TURN_MAX_COST_USD,
	turnErrorText,
	type AgentRunner,
	type AgentTurnOutput,
	type TurnErrorKind,
} from "./agent";
import { connectAccountMessage, linkUrl } from "./access";
import type { ContextEntry, ThreadCoordinator, TurnInput } from "./coordinator";
import type { Env } from "./env";
import { botToken, coordinatorFor, defaultDeps, meterFor, type Deps } from "./events";
import { REPLIES_LIMIT, readWindow, threadRead, type SlackReplies } from "./history";
import { installationSecrets, installationSlackAppId, loadInstallation, type Installation } from "./installations";
import { finishReply, footerText, postReply, replaceReply, SlackReplyStream, type ReplyTarget } from "./reply-stream";
import { postEphemeral, type SlackClient } from "./slack-api";
import type { TurnRef } from "./turns";
import { connectAccountTool, conversationAllowsUsageData, isWorkspaceMember, linkedUserId, usageTools, type ConnectOffer } from "./usage-tools";

// AgentTurnWorkflow: one answer, as a Cloudflare Workflow (billed on CPU, so
// waiting on the model costs nothing). The thread's coordinator starts it and
// never waits; it reports back with finishTurn.
//
//   load     the live installation, the access check, whether usage tools (or
//            the Connect button, for someone not linked) are allowed here; the
//            Slack session goes to "processing"
//   context  one read of the thread (conversations.replies) that ends at the
//            message answered (history.ts); when Slack rate limits it, the
//            coordinator's working memory is used alone, and the installation's
//            meter keeps Slack's Retry-After so no other thread reads until then
//   run      the agent through the gateway, streaming the answer into Slack and
//            staging it, with what it has spent, in the coordinator after every
//            agent step
//   reply    finish the Slack message with a footer (model and cost): stop the
//            stream, or write the staged answer when the live stream failed or
//            the run was retried
//   finish   count the answer in the meter, and tell the coordinator
//
// Step outputs are kept with the instance (for a day), so they hold ids and
// statuses only. Slack text lives in the coordinator, which deletes it within 7
// days. A retried step never posts twice: the reply's ts is stored as soon as
// Slack returns it, and a retry updates that message.
//
// Slack writes are retried apart from the model: a failed Slack call never runs
// the agent again, it leaves the staged answer to the reply step. The run step
// itself is retried once, for anything else; the retry counts what earlier
// attempts spent against the turn's cost limit, and the footer shows the total.

export const DEFAULT_MODEL = "phaseo/auto";
const NANOS_PER_USD = 1_000_000_000;

const LOAD_STEP = { retries: { limit: 2, delay: "2 seconds", backoff: "exponential" }, timeout: "30 seconds" } as const;
const CONTEXT_STEP = { retries: { limit: 1, delay: "2 seconds" }, timeout: "30 seconds" } as const;
/** The streaming step gets one retry at most, and never for a Slack write. */
const RUN_STEP = { retries: { limit: 1, delay: "5 seconds" }, timeout: "8 minutes" } as const;
/** Slack delivery, retried on its own. */
const REPLY_STEP = { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" }, timeout: "30 seconds" } as const;
const FINISH_STEP = { retries: { limit: 3, delay: "2 seconds", backoff: "exponential" }, timeout: "30 seconds" } as const;

export type StepConfig = {
	retries?: { limit: number; delay: string | number; backoff?: "constant" | "linear" | "exponential" };
	timeout?: string | number;
};

/** The part of WorkflowStep a turn uses; tests run it with a fake. */
export type StepRunner = {
	do<T>(name: string, config: StepConfig, callback: (context: { attempt: number }) => Promise<T>): Promise<T>;
};

export type TurnDeps = Deps & { agent: AgentRunner };

/** connectOffer: not linked, where linking would bring the usage tools. */
type LoadResult = { status: "ok"; usageTools: boolean; connectOffer?: boolean } | { status: "skip"; reason: string };
type Offered = { usageTools: boolean; connectOffer?: boolean };
type ContextResult = { source: "replies" | "memory" | "none"; messages: number };
export type RunResult = {
	status: "answered" | "cancelled" | "failed";
	ts: string | null;
	/** The live stream shows the whole staged answer; otherwise the reply step writes it. */
	streamed: boolean;
	/** The staged answer explains how it ended. False when the run step failed outright. */
	explained: boolean;
	/** Every attempt of the run together. */
	costNanos: number;
	model: string | null;
	error: TurnErrorKind | null;
};

type ReplyResult = { shown: boolean; stopped: boolean };

function replyTarget(turn: TurnRef): ReplyTarget {
	return { channel: turn.channel, threadTs: turn.threadTs, recipientUserId: turn.slackUserId, recipientTeamId: turn.teamId };
}

async function setSessionStatus(slack: SlackClient, turn: TurnRef, status: "processing" | "active"): Promise<void> {
	await slack.call("agents.sessions.setStatus", { channel_id: turn.channel, thread_ts: turn.threadTs, status });
}

function withoutMention(text: string, botUserId: string): string {
	return text.split(`<@${botUserId}>`).join("").trim();
}

function speakerLabel(entry: ContextEntry): string {
	if (entry.role === "assistant") return "You (Phaseo agent)";
	if (entry.role === "app") return entry.name ? `Another app (${entry.name})` : "Another app";
	return entry.author ? `<@${entry.author}>` : "Someone";
}

function threadLine(entry: ContextEntry, botUserId: string): string {
	return `${speakerLabel(entry)}: ${withoutMention(entry.text, botUserId)}`;
}

/**
 * The model's input: the thread's first message, the agent's earlier replies and
 * lookups (working memory) that the read doesn't show, the messages read, and
 * the new message.
 */
export function buildPrompt(input: TurnInput, turn: TurnRef, botUserId: string, source: ContextResult["source"]): string {
	const context = source === "replies" ? input.context : null;
	const shown = new Set((context?.messages ?? []).map((entry) => entry.ts).filter(Boolean));
	const memory = input.memory.filter((entry) => !(entry.kind === "reply" && entry.ts && shown.has(entry.ts)));
	const lines: string[] = [];
	const section = (heading: string, body: string[]) => {
		if (body.length) lines.push(heading, ...body, "");
	};
	if (context?.root) section("The first message in this Slack thread:", [threadLine(context.root, botUserId)]);
	section("Your earlier replies and lookups in this thread, oldest first:", memory.map((entry) => entry.kind === "reply" ? `You (Phaseo agent): ${entry.text}` : `You looked up: ${entry.text}`));
	if (context?.messages.length) {
		section(context.fromRoot ? "Earlier messages in this Slack thread, oldest first:" : "The latest messages in this Slack thread before the new one, oldest first:", [
			...context.messages.map((entry) => threadLine(entry, botUserId)),
			...(context.partial ? ["(Slack returned only part of this stretch of the thread, so some of its messages are missing.)"] : []),
		]);
	}
	if (source === "memory") lines.push(`(You couldn't read this Slack thread's messages just now${memory.length ? ", so only your own earlier replies are shown" : ""}.)`, "");
	lines.push(`New message from <@${turn.slackUserId}>:`, withoutMention(input.text, botUserId) || "(no text)");
	return lines.join("\n");
}

export function buildInstructions(installation: Pick<Installation, "instructions" | "usage_data_mode">, offered: Offered, now: number): string {
	const lines = [
		"You are the Phaseo agent, an assistant in Slack for a team that uses Phaseo, an AI gateway.",
		`Today is ${new Date(now).toISOString().slice(0, 10)} (UTC).`,
		"Write for Slack: be brief, use short paragraphs, and use Markdown lists or tables when they help. Show money in US dollars, like $12.50.",
		"You can search the web and read web pages with your web search and web fetch tools.",
	];
	if (offered.usageTools) {
		lines.push("You can look up this Phaseo workspace's spend, credit balance, API key usage and models with your tools. Dates are UTC and weeks start on Monday. Use the tools instead of guessing numbers.");
	} else if (offered.connectOffer) {
		lines.push("You can't see this workspace's Phaseo usage or billing yet, because this person hasn't connected their Phaseo account. If they ask about this workspace's spend, credits, API key usage or models, call connect_phaseo_account to send them a private button to connect it, tell them they can ask again once it's connected, and answer whatever you can without it.");
	} else if (installation.usage_data_mode === "off") {
		lines.push("This workspace's Phaseo usage and billing are not available to you. If asked, say an admin has turned that off.");
	} else {
		lines.push(`You can't see this workspace's Phaseo usage or billing in this conversation. If asked, say a workspace member who has connected their Phaseo account can ask in a direct message${installation.usage_data_mode === "dm_and_channels" ? " or an approved channel" : ""}.`);
	}
	if (installation.instructions?.trim()) lines.push("", "Instructions from this workspace's admins:", installation.instructions.trim());
	return lines.join("\n");
}

function stopNote(stopReason: string): string {
	if (stopReason.startsWith("max_cost")) return `_I stopped here to keep this answer within its $${TURN_MAX_COST_USD.toFixed(2)} cost limit._`;
	if (stopReason.startsWith("step_count")) return `_I stopped after ${MAX_STEPS} steps. Ask me to continue if you need more._`;
	return "_I stopped early._";
}

async function requireInstallation(deps: TurnDeps, turn: TurnRef): Promise<Installation> {
	const installation = await loadInstallation(deps.db, turn.installationId);
	if (!installation) throw new Error("installation_gone");
	return installation;
}

async function requireToken(deps: TurnDeps, installation: Installation): Promise<string> {
	const token = await botToken(deps, installation);
	if (!token) throw new Error("bot_token_unavailable");
	return token;
}

function toNanos(usd: number): number {
	return Math.round(usd * NANOS_PER_USD);
}

/**
 * Sends the person the private Connect button, at most once in this thread. A
 * button Slack didn't take is given back, so a later question can send it.
 */
async function offerConnect(deps: TurnDeps, turn: TurnRef, coordinator: DurableObjectStub<ThreadCoordinator>, slack: SlackClient): Promise<ConnectOffer> {
	if (!(await coordinator.claimLinkOffer(turn.slackUserId, deps.now()))) return "already_sent";
	const message = connectAccountMessage(await linkUrl(deps.env, turn.installationId, turn.slackUserId, deps.now()), "usage");
	const sent = await postEphemeral(slack, {
		channel: turn.channel,
		user: turn.slackUserId,
		text: message.text,
		blocks: message.blocks,
		...(turn.threadTs !== turn.messageTs ? { thread_ts: turn.threadTs } : {}),
	});
	if (!sent) await coordinator.releaseLinkOffer(turn.slackUserId);
	return sent ? "sent" : "not_delivered";
}

function turnTools(deps: TurnDeps, turn: TurnRef, coordinator: DurableObjectStub<ThreadCoordinator>, slack: SlackClient, installation: Installation, offered: Offered, notes: string[]) {
	if (offered.usageTools) return usageTools({ db: deps.db, workspaceId: installation.workspace_id, now: deps.now, notes });
	if (offered.connectOffer) return [connectAccountTool(() => offerConnect(deps, turn, coordinator, slack))];
	return [];
}

async function runAgent(deps: TurnDeps, turn: TurnRef, coordinator: DurableObjectStub<ThreadCoordinator>, load: Offered, context: ContextResult, attempt: number): Promise<RunResult> {
	const installation = await requireInstallation(deps, turn);
	const secrets = await installationSecrets(deps.env, installation.secrets_ciphertext);
	const slack = deps.slack(await requireToken(deps, installation));
	const input: TurnInput | null = await coordinator.turnInput(turn.turnId);
	// The turn ended meanwhile (timed out, or the thread was stopped and cleared).
	if (!input) return { status: "failed", ts: null, streamed: false, explained: true, costNanos: 0, model: null, error: null };

	// A retried run: what earlier attempts spent counts against this turn's limit and shows in its footer.
	const earlierNanos = Object.entries(input.attemptCosts).reduce((sum, [key, nanos]) => (Number(key) === attempt ? sum : sum + nanos), 0);
	const budgetUsd = TURN_MAX_COST_USD - earlierNanos / NANOS_PER_USD;
	const reply = new SlackReplyStream({
		slack,
		target: replyTarget(turn),
		existingTs: input.replyTs,
		onStarted: async (ts) => { await coordinator.setReplyTs(turn.turnId, ts); },
		now: deps.now,
	});
	const notes: string[] = [];
	let costUsd = 0;
	const stage = async () => {
		await coordinator.stageTurnOutput(turn.turnId, { attempt, costNanos: toNanos(costUsd), reply: reply.text, tools: notes });
	};

	if (budgetUsd <= 0) {
		// Earlier attempts used the whole limit: keep what they wrote instead of paying for it again.
		await reply.push(input.stagedReply ?? "");
		await reply.push(`${reply.text ? "\n\n" : ""}${stopNote(`max_cost:${TURN_MAX_COST_USD}`)}`);
		await reply.close();
		await stage();
		return { status: input.stagedReply ? "answered" : "failed", ts: reply.ts, streamed: reply.streaming, explained: true, costNanos: earlierNanos, model: null, error: null };
	}

	const controller = new AbortController();
	let cancelled = false;
	const checkCancel = async () => {
		if (cancelled) return;
		if (reply.stoppedByUser || await coordinator.isCancelled(turn.turnId)) {
			cancelled = true;
			controller.abort(new Error("turn_cancelled"));
		}
	};
	const team = turn.teamId ?? installation.team_id ?? installation.enterprise_id ?? "unknown";
	let output: AgentTurnOutput | null = null;
	let error: TurnErrorKind | null = null;
	const model = installation.model || DEFAULT_MODEL;
	try {
		output = await deps.agent.run({
			gatewayKey: secrets.gateway_key,
			model,
			instructions: buildInstructions(installation, load, deps.now()),
			prompt: buildPrompt(input, turn, installation.bot_user_id, context.source),
			endUser: `slack:${team}:${turn.slackUserId}`,
			labels: { slackTeam: team, slackChannel: turn.channel },
			tools: turnTools(deps, turn, coordinator, slack, installation, load, notes),
			maxCostUsd: budgetUsd,
			signal: controller.signal,
		}, {
			onText: async (delta) => {
				await reply.push(delta);
				if (reply.stoppedByUser) await checkCancel();
			},
			onStep: async (progress) => {
				costUsd = progress.costUsd;
				await reply.flush();
				await stage();
				await checkCancel();
			},
		});
		costUsd = output.costUsd;
	} catch (caught) {
		controller.abort();
		if (!cancelled) {
			error = classifyTurnError(caught, model);
			console.error("[slack-agent] agent run failed", { turnId: turn.turnId, installationId: turn.installationId, kind: error });
		}
	}
	const gap = reply.text ? "\n\n" : "";
	if (cancelled) {
		if (!reply.stoppedByUser) await reply.push(`${gap}_Stopped._`);
	} else if (error) {
		await reply.push(`${gap}${turnErrorText(error)}`);
	} else if (output?.stopReason) {
		await reply.push(`${gap}${stopNote(output.stopReason)}`);
	}
	await reply.close();
	await stage();
	if (reply.failure) console.warn("[slack-agent] live reply stopped, the reply step will deliver it", { turnId: turn.turnId, failure: reply.failure });
	return {
		status: cancelled ? "cancelled" : error ? "failed" : "answered",
		ts: reply.ts,
		streamed: reply.streaming,
		explained: true,
		costNanos: earlierNanos + toNanos(costUsd),
		model: output?.model ?? null,
		error,
	};
}

/**
 * Finishes the Slack message from what the run staged. Throws on a failed Slack
 * write so the step retries; each try is safe to repeat.
 */
async function deliverReply(deps: TurnDeps, turn: TurnRef, coordinator: DurableObjectStub<ThreadCoordinator>, run: RunResult): Promise<ReplyResult> {
	const installation = await loadInstallation(deps.db, turn.installationId);
	const token = installation ? await botToken(deps, installation) : null;
	// Uninstalled meanwhile: nothing can be written any more.
	if (!installation || !token) return { shown: run.streamed && run.ts !== null, stopped: false };
	const slack = deps.slack(token);
	const input = await coordinator.turnInput(turn.turnId);
	const ts = input?.replyTs ?? run.ts;
	const text = input?.stagedReply ?? "";
	const footer = run.status === "failed" ? null : footerText({ model: installation.model || DEFAULT_MODEL, answeredBy: run.model, costNanos: run.costNanos });
	// A run step that failed outright never wrote its error into the reply.
	const closing = run.explained ? null : turnErrorText(run.error ?? "failed");
	if (ts && run.streamed) {
		return { shown: true, stopped: await finishReply(slack, { channel: turn.channel, ts, text, footer, closingText: closing ? `\n\n${closing}` : null }) };
	}
	const whole = closing ? `${text}${text ? "\n\n" : ""}${closing}` : text;
	if (ts) return { shown: Boolean(whole), stopped: await replaceReply(slack, { channel: turn.channel, ts, text: whole, footer }) };
	if (text) {
		const posted = await postReply(slack, { channel: turn.channel, threadTs: turn.threadTs, text, footer });
		await coordinator.setReplyTs(turn.turnId, posted);
		return { shown: true, stopped: false };
	}
	if (closing) {
		await postEphemeral(slack, {
			channel: turn.channel,
			user: turn.slackUserId,
			text: closing,
			...(turn.threadTs !== turn.messageTs ? { thread_ts: turn.threadTs } : {}),
		});
	}
	return { shown: false, stopped: false };
}

/** Until when Slack asked the installation not to read threads, or null. A meter that can't answer doesn't stop the read. */
async function historyReadsPausedUntil(deps: TurnDeps, turn: TurnRef): Promise<number | null> {
	try {
		return await meterFor(deps.env, turn.installationId).historyReadsPausedUntil(deps.now());
	} catch {
		console.error("[slack-agent] thread read pause not checked", { turnId: turn.turnId, installationId: turn.installationId });
		return null;
	}
}

/** Keeps Slack's Retry-After in the installation's meter, so its other threads wait too. */
async function pauseHistoryReads(deps: TurnDeps, turn: TurnRef, retryAfterSeconds: number | undefined): Promise<void> {
	try {
		const { until } = await meterFor(deps.env, turn.installationId).pauseHistoryReads({ retryAfterSeconds, now: deps.now() });
		console.log("[slack-agent] thread reads paused for Slack's Retry-After", { turnId: turn.turnId, installationId: turn.installationId, until: new Date(until).toISOString() });
	} catch {
		console.error("[slack-agent] thread read pause not recorded", { turnId: turn.turnId, installationId: turn.installationId });
	}
}

/** Runs one turn. Each step is safe to repeat. */
export async function runTurn(deps: TurnDeps, turn: TurnRef, step: StepRunner): Promise<{ status: RunResult["status"] | "skipped" }> {
	const coordinator = coordinatorFor(deps.env, turn.threadKey);

	const load = await step.do<LoadResult>("load", LOAD_STEP, async () => {
		const installation = await loadInstallation(deps.db, turn.installationId);
		if (!installation) return { status: "skip", reason: "no_installation" };
		if (installation.status !== "active") return { status: "skip", reason: installation.status };
		const userId = await linkedUserId(deps.db, installation.id, turn.slackUserId);
		if (installation.access_mode === "linked" && !userId) return { status: "skip", reason: "link_required" };
		const allowed = conversationAllowsUsageData(installation, turn);
		const usage = allowed && userId !== null && await isWorkspaceMember(deps.db, installation.workspace_id, userId);
		await setSessionStatus(deps.slack(await requireToken(deps, installation)), turn, "processing");
		// Someone not linked, where linking would bring the usage tools: the agent can send them the Connect button.
		return { status: "ok", usageTools: usage, connectOffer: allowed && userId === null };
	}).catch((): LoadResult => ({ status: "skip", reason: "load_failed" }));

	if (load.status === "skip") {
		console.log("[slack-agent] turn skipped", { turnId: turn.turnId, installationId: turn.installationId, reason: load.reason });
		await step.do("skip", FINISH_STEP, async () => {
			await coordinator.finishTurn(turn.turnId, { status: "failed" }, deps.now());
			return { status: "skipped" };
		});
		return { status: "skipped" };
	}

	const context = await step.do<ContextResult>("context", CONTEXT_STEP, async () => {
		// A message that starts a thread has no history yet: it is the thread's first known message.
		if (turn.threadTs === turn.messageTs) {
			await coordinator.recordThreadRead(turn.turnId, { oldest: turn.messageTs, ts: [], complete: true });
			return { source: "none", messages: 0 };
		}
		// Slack asked this installation to wait (a 429 here or in another thread): no read until then.
		const pausedUntil = await historyReadsPausedUntil(deps, turn);
		if (pausedUntil !== null) {
			console.log("[slack-agent] thread reads paused for Slack's Retry-After, using working memory", { turnId: turn.turnId, installationId: turn.installationId, until: new Date(pausedUntil).toISOString() });
			await coordinator.recordThreadRead(turn.turnId, null);
			return { source: "memory", messages: 0 };
		}
		const installation = await requireInstallation(deps, turn);
		const slack = deps.slack(await requireToken(deps, installation));
		// One read, ending at the message answered: Slack returns a range's earliest messages first.
		const window = readWindow(await coordinator.knownMessages(), turn);
		const replies = await slack.call<SlackReplies>("conversations.replies", {
			channel: turn.channel,
			ts: turn.threadTs,
			oldest: window.oldest,
			latest: turn.messageTs,
			inclusive: true,
			limit: REPLIES_LIMIT,
		}, { form: true });
		if (replies.ok === false) {
			if (replies.error === "ratelimited") await pauseHistoryReads(deps, turn, replies.retryAfterSeconds);
			console.log("[slack-agent] thread history unavailable, using working memory", { turnId: turn.turnId, error: replies.error });
			await coordinator.recordThreadRead(turn.turnId, null);
			return { source: "memory", messages: 0 };
		}
		// The agent's own posts carry its bot user; the app id also catches any posted without one.
		const appId = await installationSlackAppId(deps.env, deps.db, installation).catch(() => null);
		const read = threadRead(replies.data, window, turn, { botUserId: installation.bot_user_id, appId });
		await coordinator.setTurnContext(turn.turnId, read.context);
		await coordinator.recordThreadRead(turn.turnId, { oldest: window.oldest, ts: read.ts, complete: !read.context.partial });
		if (read.context.partial) console.log("[slack-agent] thread read was partial", { turnId: turn.turnId, messages: read.context.messages.length });
		return { source: "replies", messages: read.context.messages.length };
	}).catch((): ContextResult => ({ source: "memory", messages: 0 }));

	const run = await step.do<RunResult>("run", RUN_STEP, async ({ attempt }) => runAgent(deps, turn, coordinator, load, context, attempt))
		.catch((error: unknown): RunResult => {
			console.error("[slack-agent] turn run step failed", { turnId: turn.turnId, error: error instanceof Error ? error.message : "unknown" });
			return { status: "failed", ts: null, streamed: false, explained: false, costNanos: 0, model: null, error: "failed" };
		});

	// Retried on its own: a Slack write that fails here never runs the model again.
	const delivered = await step.do<ReplyResult>("reply", REPLY_STEP, async () => deliverReply(deps, turn, coordinator, run))
		.catch((error: unknown): ReplyResult => {
			console.error("[slack-agent] turn reply step failed", { turnId: turn.turnId, error: error instanceof Error ? error.message : "unknown" });
			return { shown: run.streamed && run.ts !== null, stopped: false };
		});

	return step.do("finish", FINISH_STEP, async () => {
		if (!delivered.stopped) {
			const installation = await loadInstallation(deps.db, turn.installationId);
			const token = installation ? await botToken(deps, installation) : null;
			if (token) await setSessionStatus(deps.slack(token), turn, "active");
		}
		// Only an answer the person could see is counted; otherwise its meter place is given back.
		const answered = run.status === "answered" && delivered.shown;
		if (answered) {
			await meterFor(deps.env, turn.installationId).recordAnswer({ eventId: turn.eventId, slackUserId: turn.slackUserId, now: deps.now() });
		}
		await coordinator.finishTurn(turn.turnId, { status: answered ? "done" : run.status === "cancelled" ? "cancelled" : "failed" }, deps.now());
		console.log("[slack-agent] turn finished", { turnId: turn.turnId, installationId: turn.installationId, status: run.status, costNanos: run.costNanos });
		return { status: run.status };
	});
}

export class AgentTurnWorkflow extends WorkflowEntrypoint<Env, TurnRef> {
	async run(event: Readonly<WorkflowEvent<TurnRef>>, step: WorkflowStep): Promise<unknown> {
		const deps: TurnDeps = {
			...defaultDeps(this.env),
			agent: createSdkAgentRunner({ fetchImpl: gatewayFetch(), baseUrl: gatewayBaseUrl(this.env) }),
		};
		return runTurn(deps, event.payload, step as unknown as StepRunner);
	}
}
