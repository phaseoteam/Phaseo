import type { AgentQuestion } from "../shared/workspace";

const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Grok request."); return value as Record<string, unknown>; };
const string = (value: unknown, max: number): string => { if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("Invalid Grok request text."); return value; };
const optionalText = (value: unknown): string => { if (typeof value !== "string" || value.length > 10000) throw new Error("Invalid Grok choice text."); return value; };
function payload(value: unknown, methods: readonly string[]) {
	const outer = object(value);
	if (outer.params !== undefined) { if (!methods.includes(String(outer.method))) throw new Error("Invalid Grok request method."); return object(outer.params); }
	return outer;
}
export const grokQuestionMethods = ["x.ai/ask_user_question", "_x.ai/ask_user_question"] as const;
export const grokPlanMethods = ["x.ai/exit_plan_mode", "_x.ai/exit_plan_mode"] as const;

export function grokQuestionRequest(value: unknown): { sessionId: string; toolCallId: string; questions: AgentQuestion[] } {
	const input = payload(value, grokQuestionMethods);
	const sessionId = string(input.sessionId, 1000); const toolCallId = string(input.toolCallId, 1000);
	if (input.mode !== "default" && input.mode !== "plan") throw new Error("Invalid Grok question mode.");
	if (!Array.isArray(input.questions) || !input.questions.length || input.questions.length > 100) throw new Error("Invalid Grok questions.");
	const ids = new Set<string>(); const titles = new Set<string>();
	const questions = input.questions.map(value => {
		const item = object(value); const question = string(item.question, 10000);
		const id = item.id === undefined ? question : string(item.id, 1000);
		if (ids.has(id) || titles.has(question)) throw new Error("Duplicate Grok question."); ids.add(id); titles.add(question);
		if (!Array.isArray(item.options) || item.options.length > 100 || (item.multiSelect !== undefined && item.multiSelect !== null && typeof item.multiSelect !== "boolean")) throw new Error("Invalid Grok question choices.");
		const labels = new Set<string>();
		const options = item.options.map(value => { const option = object(value); const label = string(option.label, 1000); if (labels.has(label)) throw new Error("Duplicate Grok choice."); labels.add(label); return { label, ...(option.description === undefined ? {} : { description: optionalText(option.description) }), ...(option.preview === undefined ? {} : { preview: optionalText(option.preview) }) }; });
		return { id, header: "Question", question, options, isOther: true, multiSelect: item.multiSelect === true };
	});
	if (JSON.stringify(questions).length > 200000) throw new Error("Grok questions exceed the size limit.");
	return { sessionId, toolCallId, questions };
}
export function grokQuestionResponse(questions: AgentQuestion[], answers: Record<string, string[]>) {
	const result: Record<string, string[]> = Object.create(null); const annotations: Record<string, { notes?: string; preview?: string }> = Object.create(null);
	for (const question of questions) {
		const values = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
		if (!Array.isArray(values) || !values.length || values.length > 100 || values.some(value => typeof value !== "string" || !value.trim() || value.length > 10000) || (!question.multiSelect && values.length !== 1) || new Set(values).size !== values.length) return { outcome: "cancelled" as const };
		const choices = values.filter(value => question.options?.some(option => option.label === value));
		const other = values.filter(value => !choices.includes(value));
		result[question.question] = [...choices, ...(other.length ? ["Other"] : [])];
		if (other.length) annotations[question.question] = { notes: other.join("\n") };
		else if (choices.length === 1) { const preview = question.options?.find(option => option.label === choices[0])?.preview; if (preview) annotations[question.question] = { preview }; }
	}
	return { outcome: "accepted" as const, answers: result, ...(Object.keys(annotations).length ? { annotations } : {}) };
}
export function grokPlanRequest(value: unknown) {
	const input = payload(value, grokPlanMethods);
	if (input.planContent !== undefined && input.planContent !== null && (typeof input.planContent !== "string" || input.planContent.length > 100000)) throw new Error("Invalid Grok plan.");
	return { sessionId: string(input.sessionId, 1000), toolCallId: string(input.toolCallId, 1000), plan: typeof input.planContent === "string" ? input.planContent.trim() : "" };
}
