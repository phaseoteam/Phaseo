import { botToken, CHANNEL_PATTERN, coordinatorFor, threadKey, TS_PATTERN, USER_PATTERN, type Deps } from "./events";
import { findInstallation, type Installation, type SlackAppContext } from "./installations";
import {
	ANSWER_ACTION_PREFIX,
	OTHER_ACTION_ID,
	OTHER_INPUT_ID,
	OTHER_VIEW_ID,
	otherAnswerView,
	otherViewMetadata,
	parseAnswerValue,
	parseOtherViewMetadata,
	updateQuestionMessage,
	type AnswerRef,
	type QuestionAnswer,
} from "./questions";
import { postEphemeral, type SlackClient } from "./slack-api";

// Button clicks (block_actions) and form submissions (view_submission). Cancel
// stops the thread's running turn and drops its queued follow-ups. A question's
// buttons answer it (questions.ts), and Other opens a small form for an answer in
// the person's own words; only the person asked can answer, anyone else gets a
// private note. Connect account is a link button: Slack still reports the click,
// which needs nothing more. Feedback buttons are acknowledged for now.

export const CANCEL_ACTION_ID = "cancel_turn";
export const CONNECT_ACTION_ID = "connect_account";
export const FEEDBACK_ACTION_PREFIX = "feedback";

export type InteractionPayload = {
	type?: string;
	api_app_id?: string;
	is_enterprise_install?: boolean;
	team?: { id?: string } | null;
	enterprise?: { id?: string } | null;
	user?: { id?: string; team_id?: string };
	channel?: { id?: string };
	container?: { channel_id?: string; message_ts?: string; thread_ts?: string };
	message?: { ts?: string; thread_ts?: string };
	actions?: Array<{ action_id?: string; value?: string }>;
	/** For opening a form: valid for 3 seconds after the click. */
	trigger_id?: string;
	view?: { callback_id?: string; private_metadata?: string; state?: { values?: Record<string, Record<string, { value?: string | null }>> } };
};

export type InteractionOutcome = "ignored" | "acknowledged" | "cancelled" | "answered" | "form_opened" | "refused" | "no_installation" | "error";

/** The Cancel button for a thread. Its value is the thread's root ts; the channel comes from the click. */
export function cancelButton(threadTs: string) {
	return { type: "button", action_id: CANCEL_ACTION_ID, value: threadTs, text: { type: "plain_text", text: "Cancel" } };
}

function installationFor(deps: Deps, app: SlackAppContext, payload: InteractionPayload): Promise<Installation | null> {
	return findInstallation(deps.db, app, {
		teamId: payload.team?.id ?? payload.user?.team_id ?? null,
		enterpriseId: payload.enterprise?.id ?? null,
		isEnterpriseInstall: payload.is_enterprise_install === true,
	});
}

export async function handleInteraction(deps: Deps, app: SlackAppContext, payload: InteractionPayload): Promise<InteractionOutcome> {
	try {
		if (payload.type === "view_submission") return payload.view?.callback_id === OTHER_VIEW_ID ? await submitOtherAnswer(deps, app, payload) : "ignored";
		if (payload.type !== "block_actions") return "ignored";
		const action = payload.actions?.[0];
		const actionId = action?.action_id ?? "";
		if (actionId === CONNECT_ACTION_ID || actionId.startsWith(FEEDBACK_ACTION_PREFIX)) return "acknowledged";
		if (actionId.startsWith(ANSWER_ACTION_PREFIX) || actionId === OTHER_ACTION_ID) return await clickAnswer(deps, app, payload, action?.value);
		if (actionId !== CANCEL_ACTION_ID) return "ignored";

		const channel = payload.channel?.id ?? payload.container?.channel_id ?? "";
		const threadTs = action?.value ?? "";
		if (!CHANNEL_PATTERN.test(channel) || !TS_PATTERN.test(threadTs)) return "ignored";
		const installation = await installationFor(deps, app, payload);
		if (!installation) return "no_installation";
		const result = await coordinatorFor(deps.env, threadKey(installation.id, channel, threadTs)).cancel(deps.now());
		console.log("[slack-agent] cancel clicked", { installationId: installation.id, turnId: result.turnId, dropped: result.dropped });
		return "cancelled";
	} catch (error) {
		console.error("[slack-agent] interaction failed", { type: payload.type, error: error instanceof Error ? error.message : "unknown" });
		return "error";
	}
}

/** The private note for someone whose answer wasn't taken. */
function refusalNote(result: { status: "not_asker"; askerId: string } | { status: "closed"; askerId: string | null; question: { status: string } | null }): string {
	if (result.status === "not_asker") return `Only <@${result.askerId}> can answer this question.`;
	if (result.question?.status === "answered") return "This question has already been answered.";
	return "This question is closed, so I can't take an answer to it now. Ask me again in the thread.";
}

/** A question's button: an option answers it; Other opens the form for their own words. */
async function clickAnswer(deps: Deps, app: SlackAppContext, payload: InteractionPayload, value: string | undefined): Promise<InteractionOutcome> {
	const ref = parseAnswerValue(value);
	const channel = payload.channel?.id ?? payload.container?.channel_id ?? "";
	const user = payload.user?.id ?? "";
	if (!ref || !CHANNEL_PATTERN.test(channel) || !USER_PATTERN.test(user)) return "ignored";
	const installation = await installationFor(deps, app, payload);
	if (!installation) return "no_installation";
	const token = await botToken(deps, installation);
	if (!token) return "error";
	const slack = deps.slack(token);
	const coordinator = coordinatorFor(deps.env, threadKey(installation.id, channel, ref.threadTs));
	const note = async (text: string) => {
		await postEphemeral(slack, { channel, user, text, thread_ts: ref.threadTs });
	};

	if (ref.choice === "other") {
		const question = await coordinator.question(ref.turnId, ref.n);
		const asker = await coordinator.askerOf(ref.turnId);
		if (!question || !asker || question.status !== "open") {
			await note(refusalNote({ status: "closed", askerId: asker, question }));
			return "refused";
		}
		if (asker !== user) {
			await note(refusalNote({ status: "not_asker", askerId: asker }));
			return "refused";
		}
		const trigger = payload.trigger_id ?? "";
		if (!trigger) return "ignored";
		const opened = await slack.call("views.open", { trigger_id: trigger, view: otherAnswerView(question, otherViewMetadata(channel, ref)) });
		return opened.ok ? "form_opened" : "error";
	}

	return answer(deps, installation, slack, { channel, user, ref, answer: { by: "button", choice: ref.choice, text: "" } }, note);
}

/** The Other form was sent: their own words answer the question. */
async function submitOtherAnswer(deps: Deps, app: SlackAppContext, payload: InteractionPayload): Promise<InteractionOutcome> {
	const where = parseOtherViewMetadata(payload.view?.private_metadata);
	const user = payload.user?.id ?? "";
	const text = payload.view?.state?.values?.[OTHER_INPUT_ID]?.[OTHER_INPUT_ID]?.value ?? "";
	if (!where || !USER_PATTERN.test(user) || typeof text !== "string" || !text.trim()) return "ignored";
	const installation = await installationFor(deps, app, payload);
	if (!installation) return "no_installation";
	const token = await botToken(deps, installation);
	if (!token) return "error";
	const slack = deps.slack(token);
	const note = async (message: string) => {
		await postEphemeral(slack, { channel: where.channel, user, text: message, thread_ts: where.threadTs });
	};
	return answer(deps, installation, slack, { channel: where.channel, user, ref: { ...where, choice: "other" }, answer: { by: "form", choice: null, text } }, note);
}

/** Records the answer in the thread's coordinator (which wakes the turn) and shows it on the question at once. */
async function answer(
	deps: Deps,
	installation: Installation,
	slack: SlackClient,
	input: { channel: string; user: string; ref: AnswerRef; answer: QuestionAnswer },
	note: (text: string) => Promise<void>,
): Promise<InteractionOutcome> {
	const { channel, user, ref } = input;
	const coordinator = coordinatorFor(deps.env, threadKey(installation.id, channel, ref.threadTs));
	const result = await coordinator.answerQuestion({ turnId: ref.turnId, n: ref.n, slackUserId: user, answer: input.answer, now: deps.now() });
	if (result.status !== "answered") {
		// A second click on the asker's own answer needs no note.
		if (!(result.status === "closed" && result.askerId === user && result.question?.status === "answered")) await note(refusalNote(result));
		return "refused";
	}
	console.log("[slack-agent] question answered", { installationId: installation.id, turnId: ref.turnId, question: ref.n, by: input.answer.by });
	// The turn's close step shows it too; this is so the buttons go at once.
	await updateQuestionMessage(slack, { channel, threadTs: ref.threadTs, turnId: ref.turnId, askerId: result.askerId }, result.question);
	return "answered";
}
