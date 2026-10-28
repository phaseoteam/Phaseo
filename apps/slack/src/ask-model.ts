import type { AgentTool } from "@phaseo/agent-sdk";
import { classifyTurnError, isAutoModel, TURN_MAX_COST_USD, type AskOutput, type TurnErrorKind } from "./agent";
import type { Installation } from "./installations";
import { allowedModels, modelChoiceOn, modelNames, type AllowedModel } from "./model-choice";
import type { Db } from "./supabase";
import { ToolInputError } from "./usage-tools";

// ask_model: the agent asks another of the installation's allowed models
// mid-answer, for a second opinion or a draft to compare with its own. It is
// offered only while model choice is on, with at least one allowed model besides
// the one answering.
//
// The other model gets only the prompt the agent writes (no Slack thread, no
// tools): one non-streaming gateway request with the answer's key, labels, end
// user and session. Each answer may ask at most MAX_CONSULTS times. What each
// consult costs counts against the answer's $0.50 limit with the agent's own
// spend, so the agent stops being able to ask once too little is left to finish
// its answer. Consults run one at a time, so each sees what the last one cost.
// Once the answer has searched Slack, a consult goes only to providers that keep
// no data (agent.ts), and a model without one can't be asked. Nor can Auto: the
// gateway's auto router sends the prompt to a model of its own, without that
// promise, to choose one, so the consult is refused before it is sent.

export const ASK_MODEL_TOOL_ID = "ask_model";
/** Consults an answer may make, including ones that failed. */
export const MAX_CONSULTS = 3;
/** A consult needs at least this much of the answer's limit left, so the agent can still write its answer after it. */
export const CONSULT_MIN_LEFT_USD = 0.1;
export const CONSULT_MAX_OUTPUT_TOKENS = 4_000;
const MAX_PROMPT_CHARS = 20_000;
/** The other model's answer as the agent reads it. */
const MAX_ANSWER_CHARS = 12_000;

const CONSULT_INSTRUCTIONS = [
	"Another AI assistant, the Phaseo agent in Slack, is asking you this while it writes an answer for someone.",
	"Answer the prompt directly and concisely. You can't search the web or use tools, so say when you aren't sure.",
].join(" ");

/** One consult: the model asked and what it cost. `answered`: it returned text the agent could use. */
export type Consult = { model: string; costUsd: number; answered: boolean };

export type AskModelOptions = {
	/** The allowed models other than the one answering, in the admins' order. */
	models: AllowedModel[];
	ask: (request: { model: string; instructions: string; prompt: string; maxOutputTokens: number; signal?: AbortSignal; zeroDataRetention?: () => Promise<boolean> }) => Promise<AskOutput>;
	/**
	 * Whether the answer has searched Slack (searchedThisAnswer). Asked as each
	 * consult is sent: from the first search on, it goes only to providers that
	 * keep no data, and a model none of whose providers do can't be asked. Auto
	 * isn't asked at all (autoAfterSearchText).
	 */
	searched?: () => Promise<boolean>;
	/** What the answer may still spend: its limit less the agent's own spend and the consults so far. */
	budgetLeftUsd: () => number;
	/** Every consult of this run, appended as each finishes. */
	consults: Consult[];
	/** Consults the answer made before this run (the runs before its questions). */
	alreadyAsked?: number;
	/** Short notes for the thread's working memory. */
	notes: string[];
};

/** A failed consult as the agent reads it, so it can tell the person why it answered without that model. */
export function consultErrorText(kind: TurnErrorKind, name: string): string {
	switch (kind) {
		case "no_credits":
			return "This Phaseo workspace is out of credits, so no model can be asked.";
		case "cap_reached":
			return "The Phaseo agent's monthly spending limit has been reached, so no model can be asked.";
		case "model_not_allowed":
			return `${name} isn't available to the Slack agent: no provider of it meets the agent's data rules, or a workspace policy blocks it.`;
		case "model_unavailable":
			return `${name} isn't available right now.`;
		case "search_needs_zdr":
			return `${name} can't be used after a Slack search: once an answer has searched Slack, it may only use AI providers that keep no data (zero data retention), and ${name} has none. Answer without it, and say so if they asked for it.`;
		// access_changed only follows a question, never a gateway error; files_unsupported needs shared files, which aren't sent here.
		case "access_changed":
		case "files_unsupported":
		case "failed":
			return `Asking ${name} failed.`;
	}
}

/** Why Auto can't be asked once the answer has searched Slack, for the agent to pass on. */
export function autoAfterSearchText(name: string): string {
	return `${name} can't be asked after a Slack search: once an answer has searched Slack, it may only use AI providers that keep no data (zero data retention), and ${name} picks a model for each request and can't promise one. Answer without it, or ask another model, and say so if they asked for it.`;
}

function usd(value: number): number {
	return Math.max(0, Math.round(value * 10_000) / 10_000);
}

/** ask_model, when people may choose models here and at least one allowed model isn't the one answering (`model`). */
export async function askModelTools(db: Db, installation: Pick<Installation, "model_choice_enabled" | "allowed_models">, model: string, options: Omit<AskModelOptions, "models">): Promise<AgentTool<any, any>[]> {
	if (!modelChoiceOn(installation)) return [];
	const others = installation.allowed_models.filter((id) => id !== model);
	if (!others.length) return [];
	return [askModelTool({ ...options, models: allowedModels({ allowed_models: others }, await modelNames(db, others)) })];
}

export function askModelTool(options: AskModelOptions): AgentTool<any, any> {
	const { models, consults } = options;
	let started = options.alreadyAsked ?? 0;
	let queue: Promise<unknown> = Promise.resolve();
	const listed = models.map((model) => model.name === model.id ? model.id : `${model.name} (${model.id})`).join(", ");
	return {
		id: ASK_MODEL_TOOL_ID,
		description: [
			"Ask another AI model for its answer or a second opinion, and get its reply back. Use it when the person asks what another model thinks, or when a second view would really help.",
			"The model sees only your prompt: not this Slack thread, your instructions or your tools. Put everything it needs in the prompt.",
			`At most ${MAX_CONSULTS} times per answer. Each one costs money from this answer's $${TURN_MAX_COST_USD.toFixed(2)} limit. Say in your answer which model you asked.`,
			`Models you can ask: ${listed}.`,
		].join(" "),
		parameters: {
			type: "object",
			properties: {
				model: { type: "string", enum: models.map((model) => model.id), description: "The id of the model to ask." },
				prompt: { type: "string", description: "Everything the model needs, written for it: the question and any context or text it should look at." },
			},
			required: ["model", "prompt"],
			additionalProperties: false,
		},
		onError: "return-to-model",
		execute: async (input: Record<string, unknown>, context) => {
			const asked = typeof input.model === "string" ? input.model.trim().toLowerCase() : "";
			const model = models.find((entry) => entry.id.toLowerCase() === asked || entry.name.toLowerCase() === asked);
			if (!model) throw new ToolInputError(`model must be one of: ${models.map((entry) => entry.id).join(", ")}`);
			const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
			if (!prompt) throw new ToolInputError("prompt must not be empty");
			if (prompt.length > MAX_PROMPT_CHARS) throw new ToolInputError(`prompt must be at most ${MAX_PROMPT_CHARS.toLocaleString("en-US")} characters`);
			// Never sent, so not a consult. If it can't be told whether the answer has searched, it is refused all the same.
			if (isAutoModel(model.id) && options.searched && await options.searched().catch(() => true)) throw new Error(autoAfterSearchText(model.name));
			if (started >= MAX_CONSULTS) throw new Error(`You have already asked other models ${MAX_CONSULTS} times for this answer, the most allowed. Answer with what you have.`);
			started += 1;
			// One at a time: the budget check below sees what the consult before it cost.
			const turn = queue.then(async () => {
				const left = options.budgetLeftUsd();
				if (left < CONSULT_MIN_LEFT_USD) {
					throw new Error(`Only $${usd(left).toFixed(2)} of this answer's $${TURN_MAX_COST_USD.toFixed(2)} limit is left, too little to ask another model. Answer with what you have.`);
				}
				const consult: Consult = { model: model.id, costUsd: 0, answered: false };
				try {
					const output = await options.ask({ model: model.id, instructions: CONSULT_INSTRUCTIONS, prompt, maxOutputTokens: CONSULT_MAX_OUTPUT_TOKENS, signal: context.signal, zeroDataRetention: options.searched });
					consult.costUsd = output.costUsd;
					consult.answered = output.text.length > 0;
					return output;
				} catch (error) {
					// The answer is being stopped: not the other model's fault.
					if (context.signal?.aborted) throw error;
					const searched = options.searched ? await options.searched().catch(() => false) : false;
					throw new Error(consultErrorText(classifyTurnError(error, model.id, searched), model.name));
				} finally {
					consults.push(consult);
					options.notes.push(`${ASK_MODEL_TOOL_ID} ${model.id}`);
				}
			});
			queue = turn.catch(() => undefined);
			const output = await turn;
			return {
				model: model.id,
				name: model.name,
				answer: output.text ? output.text.slice(0, MAX_ANSWER_CHARS) : "(The model returned no text.)",
				...(output.text.length > MAX_ANSWER_CHARS ? { truncated: true } : {}),
				cost_usd: usd(output.costUsd),
				asks_left: MAX_CONSULTS - started,
				budget_left_usd: usd(options.budgetLeftUsd()),
			};
		},
	};
}
