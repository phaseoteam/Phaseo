import { classifyTurnError, TURN_MAX_COST_USD, type AgentRunner, type AskRequest, type TurnErrorKind } from "./agent";
import type { Installation } from "./installations";
import { MAX_COMPARED, MIN_COMPARED, modelChoiceOn } from "./model-choice";
import { costText, markdownLink, MAX_MARKDOWN_CHARS, type FooterModel } from "./reply-stream";

// Compare: a message that starts with `compare <model>, <model>[, <model>]:` is
// answered by each of those allowed models (events.ts checks the names before the
// meter, like `with <model>:`). The question goes to every model at once, as one
// non-streaming gateway request each, with the gateway's web search and fetch
// tools and the answer's key, labels, end user and session. The answer's $0.50
// limit is split evenly between them. The reply has a section per model (its
// name, linked to its page, its cost and its answer) and the usual footer with
// the total, and counts as one answer. A model that fails shows its error in its
// section; the others are kept.
//
// The gateway can't stop one request at a dollar amount, so a model's share is
// held the way the agent's own limit is, between requests: a model whose share is
// too small isn't asked, and each request's output is capped.

/** Each compared model's request. Reasoning counts too, so this is well above the short answer asked for. */
export const COMPARE_MAX_OUTPUT_TOKENS = 4_000;
/** A model isn't asked when its share of the limit is smaller than this (a retry after earlier attempts spent most of it). */
export const COMPARE_MIN_SHARE_USD = 0.02;
/** What the sections may hold together, leaving room for the footer. */
const SECTIONS_CHARS = MAX_MARKDOWN_CHARS - 600;

export type ComparedAnswer = {
	model: string;
	text: string;
	costUsd: number;
	/**
	 * Why the model gave no answer: a gateway error, `skipped` when its share of
	 * the limit was too small, or `empty` when it ran out of output without writing
	 * any (its cost still counts).
	 */
	error: TurnErrorKind | "skipped" | "empty" | null;
};

/**
 * The models a Compare turn asks: those of the message the installation still
 * allows (an admin may have changed that since it was queued). Null when fewer
 * than two are left, and the turn is answered as usual by the installation's model.
 */
export function comparedModels(installation: Pick<Installation, "model_choice_enabled" | "allowed_models">, turn: { compare?: string[] | null }): string[] | null {
	if (!turn.compare?.length || !modelChoiceOn(installation)) return null;
	const models = [...new Set(turn.compare)].filter((id) => installation.allowed_models.includes(id)).slice(0, MAX_COMPARED);
	return models.length >= MIN_COMPARED ? models : null;
}

export function comparisonInstructions(installation: Pick<Installation, "instructions">, now: number): string {
	const lines = [
		"You are answering in Slack for a team that uses Phaseo, an AI gateway. Your answer is shown next to other models' answers to the same question, so they can be compared.",
		`Today is ${new Date(now).toISOString().slice(0, 10)} (UTC).`,
		"Answer in at most about 250 words. Use short paragraphs, and Markdown lists or tables when they help. Show money in US dollars, like $12.50.",
		"You can search the web and read web pages with your web search and web fetch tools.",
	];
	if (installation.instructions?.trim()) lines.push("", "Instructions from this workspace's admins:", installation.instructions.trim());
	return lines.join("\n");
}

/** Asks every model at once, each with an even share of `budgetUsd`. Never throws: a failed model keeps its error. */
export async function compareAnswers(agent: AgentRunner, args: {
	models: string[];
	question: string;
	instructions: string;
	request: Pick<AskRequest, "gatewayKey" | "endUser" | "sessionId" | "labels" | "signal">;
	budgetUsd: number;
}): Promise<ComparedAnswer[]> {
	const share = args.budgetUsd / args.models.length;
	return Promise.all(args.models.map(async (model): Promise<ComparedAnswer> => {
		if (share < COMPARE_MIN_SHARE_USD) return { model, text: "", costUsd: 0, error: "skipped" };
		try {
			const output = await agent.ask({ ...args.request, model, instructions: args.instructions, prompt: args.question, webTools: true, maxOutputTokens: COMPARE_MAX_OUTPUT_TOKENS });
			// A reasoning model can use its whole output allowance before writing anything.
			return { model, text: output.text, costUsd: output.costUsd, error: output.text.trim() ? null : "empty" };
		} catch (error) {
			return { model, text: "", costUsd: 0, error: classifyTurnError(error, model) };
		}
	}));
}

/** A model's section when it gave no answer. */
function failureText(error: Exclude<ComparedAnswer["error"], null>): string {
	switch (error) {
		case "skipped":
			return `_Not asked: this answer's $${TURN_MAX_COST_USD.toFixed(2)} limit was already used._`;
		case "empty":
			return "_No answer: this model used its whole output allowance before writing one._";
		case "no_credits":
			return "_This Phaseo workspace is out of credits. An admin can add credits in Phaseo billing._";
		case "cap_reached":
			return "_The Phaseo agent's monthly spending limit has been reached. An admin can raise it in Phaseo settings._";
		case "model_not_allowed":
			return "_This model isn't available to the Slack agent._";
		case "model_unavailable":
			return "_This model isn't available right now. Please try again in a few minutes._";
		// access_changed only follows a question, never a gateway error.
		case "access_changed":
		case "failed":
			return "_Something went wrong while this model was answering._";
	}
}

/**
 * The reply: a section per model, in the order asked, each headed by its name
 * (linked to its model page), its cost and its answer. Each answer is cut to its
 * share of one Slack message.
 */
export function comparisonText(answers: ComparedAnswer[], names: Map<string, FooterModel>): string {
	const perSection = Math.floor(SECTIONS_CHARS / Math.max(1, answers.length));
	return answers.map((answer) => {
		const model = names.get(answer.model) ?? { name: answer.model, url: null };
		// What a model cost shows even when it gave no answer, as long as it cost something.
		const heading = `**${markdownLink(model.name, model.url)}**${answer.error && !answer.costUsd ? "" : ` · ${costText(Math.round(answer.costUsd * 1_000_000_000))}`}`;
		const room = perSection - heading.length - 4;
		const body = answer.error ? failureText(answer.error) : answer.text;
		return `${heading}\n\n${body.length > room ? `${body.slice(0, Math.max(0, room - 1))}…` : body}`;
	}).join("\n\n");
}
