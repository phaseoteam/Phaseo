import { allowsOwnAnswer, questionAnswerError, questionOptions } from "../../shared/agentQuestions";
import type { AgentQuestion } from "../../shared/workspace";

/** picked holds option values; other is the person's own answer, used when otherOn (or when there are no options). */
export type QuestionDraft = { picked: string[]; other: string; otherOn: boolean };

/** A fresh draft: editable starting text fills the own answer. */
export const draftFor = (question: AgentQuestion): QuestionDraft => ({ picked: [], other: question.initialAnswer ?? "", otherOn: question.initialAnswer !== undefined });

/**
 * The answer a draft gives: chosen options, then the person's own words (which stand alone for a single choice).
 * Starting text keeps its whitespace and may be sent empty; an optional question with nothing chosen sends an empty answer.
 */
export function draftAnswer(question: AgentQuestion, draft: QuestionDraft): string[] {
	const literal = question.initialAnswer !== undefined;
	const own = allowsOwnAnswer(question) && (draft.otherOn || !questionOptions(question).length) ? literal ? draft.other : draft.other.trim() : undefined;
	const custom = own !== undefined && (own.length > 0 || literal) ? [own] : [];
	if (!question.multiSelect) {
		const answer = custom.length ? custom : draft.picked.slice(0, 1);
		return answer.length || question.required !== false ? answer : [""];
	}
	return [...draft.picked, ...custom.filter(value => value.length > 0)];
}

/** Why the draft cannot be sent yet, or undefined. */
export const draftError = (question: AgentQuestion, draft: QuestionDraft) => questionAnswerError(question, draftAnswer(question, draft));

/** The person typed their own answer elsewhere (the composer): it replaces a single choice and joins a multiple one. */
export function withOwnAnswer(question: AgentQuestion, draft: QuestionDraft, text: string): QuestionDraft {
	return { picked: question.multiSelect ? draft.picked : [], other: text, otherOn: true };
}
