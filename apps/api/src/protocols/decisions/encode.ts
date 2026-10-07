import type { IRDecisionsRequest, IRDecisionsResponse } from "@core/ir";
import { NativeDecisionAnswerSchema } from "@core/decisions";
import { decisionQuestionId } from "./decode";

export function encodeDecisionsResponse(ir: IRDecisionsResponse, request?: IRDecisionsRequest): any {
	const usage = ir.usage ? {
		input_tokens: ir.usage.inputTokens, output_tokens: ir.usage.outputTokens, total_tokens: ir.usage.totalTokens,
	} : undefined;
	if (!request?.decisionContext) return { model: ir.model, answers: ir.answers, ...(usage ? { usage } : {}) };

	const answers = ir.nativeAnswers ?? request.decisionContext.questions.map((question, index) => {
		const answer = ir.answers[decisionQuestionId(index)];
		if (!answer || typeof answer !== "object") throw new Error("invalid_decisions_response");
		const name = question.name ?? null;
		if (answer.type === "refusal") return { type: "refusal", name };
		if (question.type === "predicate" && answer.type === "noul") {
			return { type: "predicate", name, probability: answer.noul };
		}
		if (question.type === "choice" && answer.type === "choice") {
			return {
				type: "choice", name, choice: question.choices[Number(answer.choice)]?.value, confidence: answer.confidence,
				probabilities: question.choices.map((choice, option) => ({ value: choice.value, probability: answer.probabilities?.[String(option)] })),
			};
		}
		if (question.type === "score" && answer.type === "score") {
			return {
				type: "score", name, score: answer.score, confidence: answer.confidence,
				probabilities: question.levels.map((level, option) => ({ value: option, label: level.label, probability: answer.probabilities?.[String(option)] })),
			};
		}
		throw new Error("invalid_decisions_response");
	});
	if (answers.some(answer => !NativeDecisionAnswerSchema.safeParse(answer).success)) throw new Error("invalid_decisions_response");
	return {
		model: ir.model, answers,
		...(usage ? { usage: {
			input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
			output_tokens_details: { reasoning_tokens: 0 },
			...ir.nativeUsage, ...usage,
		} } : {}),
	};
}
