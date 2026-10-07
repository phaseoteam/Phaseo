import type { DecisionsRequest } from "@core/schemas";
import { LegacyDecisionsSchema } from "@core/schemas";
import type { z } from "zod";
import type { IRDecisionQuestion, IRDecisionsRequest } from "@core/ir";
import { NativeDecisionAnswerSchema, type NativeDecisionQuestion, type NativeDecisionRequest } from "@core/decisions";

export function decisionQuestionId(index: number): string {
	return `question_${index}`;
}

export function decodeDecisionsRequest(req: DecisionsRequest): IRDecisionsRequest {
	if (!Array.isArray(req.questions)) {
		const legacy = req as z.infer<typeof LegacyDecisionsSchema>;
		return {
			model: legacy.model, state: legacy.state,
			...(legacy.images === undefined ? {} : { images: legacy.images }),
			questions: legacy.questions as IRDecisionsRequest["questions"],
		};
	}
	const native = req as unknown as NativeDecisionRequest;
	const images: string[] = [];
	const state = typeof native.input === "string" ? native.input : native.input.map(message => ({
		role: message.role,
		content: typeof message.content === "string" ? message.content : message.content.map(part => {
			if (part.type === "input_text") return part.text;
			const index = images.push(part.image_url) - 1;
			return `[Image ${index}]`;
		}).join("\n"),
	}));
	const questions = Object.fromEntries(native.questions.map((question, index): [string, IRDecisionQuestion] => {
		const id = decisionQuestionId(index);
		if (question.type === "predicate") return [id, { type: "noul", instructions: question.instructions }];
		if (question.type === "choice") return [id, {
			type: "choice", instructions: question.instructions,
			criteria: Object.fromEntries(question.choices.map((choice, option) => [String(option),
				choice.description === undefined ? String(choice.value) : `${String(choice.value)}: ${choice.description}`])),
		}];
		return [id, {
			type: "score", instructions: question.instructions,
			criteria: question.levels.map(level => level.description === undefined ? level.label : `${level.label}: ${level.description}`),
		}];
	}));
	return {
		model: native.model, state, questions,
		...(images.length ? { images } : {}),
		decisionContext: {
			model: native.model, input: native.input, questions: native.questions,
			...(native.safety_identifier === undefined ? {} : { safety_identifier: native.safety_identifier }),
		},
	};
}

// Question order is authoritative; names may be absent, empty, or repeated.
export function decodeNativeDecisionAnswer(payload: unknown, question: NativeDecisionQuestion): Record<string, any> | null {
	const parsed = NativeDecisionAnswerSchema.safeParse(payload);
	if (!parsed.success || parsed.data.name !== (question.name ?? null)) return null;
	const answer = parsed.data;
	if (answer.type === "refusal") return { type: "refusal" };
	if (question.type === "predicate") {
		return answer.type === "predicate" ? { type: "noul", noul: answer.probability } : null;
	}
	if (question.type !== answer.type) return null;
	const options: Array<string | boolean | number> = question.type === "choice" ? question.choices.map(choice => choice.value) : question.levels.map((_, index) => index);
	if (answer.probabilities.length !== options.length) return null;
	const probabilities: Record<string, number> = Object.create(null);
	for (const option of answer.probabilities) {
		const index = options.findIndex(value => value === option.value);
		if (index < 0 || Object.hasOwn(probabilities, String(index))) return null;
		if (question.type === "score" && ("label" in option) && option.label !== question.levels[index].label) return null;
		probabilities[String(index)] = option.probability;
	}
	if (Math.abs(Object.values(probabilities).reduce((sum, value) => sum + value, 0) - 1) > 0.01 + Number.EPSILON * 8) return null;
	if (answer.type === "choice") {
		const index = options.findIndex(value => value === answer.choice);
		return index < 0 ? null : { type: "choice", choice: String(index), confidence: answer.confidence, probabilities };
	}
	if (answer.type !== "score" || question.type !== "score" || answer.score > options.length - 1) return null;
	const expected = Object.entries(probabilities).reduce((sum, [index, value]) => sum + Number(index) * value, 0);
	if (Math.abs(answer.score - expected) > 0.02) return null;
	return {
		type: "score", score: answer.score, confidence: answer.confidence, probabilities,
		legend: Object.fromEntries(question.levels.map((level, index) => [String(index), level.label])),
	};
}
