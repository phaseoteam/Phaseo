import { z } from "zod";

export type DecisionValue = string | boolean;
export type DecisionInputPart =
	| { type: "input_text"; text: string }
	| { type: "input_image"; image_url: string; detail?: "low" | "high" | "auto" | "original" | null };
export type DecisionInput = string | Array<{ role: "user"; type?: "message"; content: string | DecisionInputPart[] }>;
export type NativeDecisionQuestion =
	| { type: "predicate"; name?: string; instructions: string }
	| { type: "choice"; name?: string; instructions: string; choices: Array<{ value: DecisionValue; description?: string }> }
	| { type: "score"; name?: string; instructions: string; levels: Array<{ label: string; description?: string }> };
export type NativeDecisionRequest = {
	model: string;
	input: DecisionInput;
	questions: NativeDecisionQuestion[];
	safety_identifier?: string | null;
};

const instructions = z.string().max(1048576);
const commonQuestion = { name: instructions.optional(), instructions };
const value = z.union([z.string(), z.boolean()]);
export const NativeDecisionQuestionSchema = z.discriminatedUnion("type", [
	z.object({ ...commonQuestion, type: z.literal("predicate") }).strict(),
	z.object({
		...commonQuestion, type: z.literal("choice"),
		choices: z.array(z.object({ value, description: instructions.optional() }).strict()).min(1),
	}).strict(),
	z.object({
		...commonQuestion, type: z.literal("score"),
		levels: z.array(z.object({ label: instructions, description: instructions.optional() }).strict()).min(1),
	}).strict(),
]);
const inputPart = z.discriminatedUnion("type", [
	z.object({ type: z.literal("input_text"), text: z.string().max(10485760) }).strict(),
	z.object({
		type: z.literal("input_image"),
		image_url: z.string().max(1073741824).regex(/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i),
		detail: z.enum(["low", "high", "auto", "original"]).nullable().optional(),
	}).strict(),
]);
export const NativeDecisionsBodySchema = z.object({
	model: z.string().min(1).max(1048576),
	input: z.union([
		z.string().max(10485760),
		z.array(z.object({
			role: z.literal("user"), type: z.literal("message").optional(),
			content: z.union([z.string().max(10485760), z.array(inputPart)]),
		}).strict()),
	]),
	questions: z.array(NativeDecisionQuestionSchema).min(1).superRefine((questions, ctx) => {
		questions.forEach((question, index) => {
			if (question.type !== "choice") return;
			const values = question.choices.map(choice => JSON.stringify(choice.value));
			if (new Set(values).size !== values.length) {
				ctx.addIssue({ code: "custom", path: [index, "choices"], message: "Choice values must be distinct." });
			}
		});
	}),
	safety_identifier: z.string().max(128).nullable().optional(),
}).superRefine((body, ctx) => {
	const images = typeof body.input === "string" ? 0 : body.input.reduce((total, message) =>
		total + (typeof message.content === "string" ? 0 : message.content.filter(part => part.type === "input_image").length), 0);
	if (images > 128) ctx.addIssue({ code: "custom", path: ["input"], message: "At most 128 images are supported." });
});

const probability = z.number().finite().min(0).max(1);
const answerName = z.string().nullable();
export const NativeDecisionAnswerSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("predicate"), name: answerName, probability }).passthrough(),
	z.object({
		type: z.literal("choice"), name: answerName, choice: value, confidence: probability,
		probabilities: z.array(z.object({ value, probability }).passthrough()),
	}).passthrough(),
	z.object({
		type: z.literal("score"), name: answerName, score: z.number().finite().min(0), confidence: probability,
		probabilities: z.array(z.object({ value: z.number().int().min(0), label: z.string(), probability }).passthrough()),
	}).passthrough(),
	z.object({ type: z.literal("refusal"), name: answerName }).passthrough(),
]);
