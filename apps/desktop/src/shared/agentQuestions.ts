import type { AgentQuestion, AgentQuestionInput, AgentQuestionOption } from "./workspace";
import type { AgentForm, FormAnswer, FormField } from "./agentForms";

/** A question's choices; a yes/no question without options gets Yes and No. */
export function questionOptions(question: AgentQuestion): AgentQuestionOption[] {
	if (question.options?.length) return question.options;
	if (question.input?.kind === "boolean") return [{ label: "Yes", value: "true" }, { label: "No", value: "false" }];
	return [];
}
export const optionValue = (option: AgentQuestionOption) => option.value ?? option.label;
/** Whether the person can type an answer of their own: offered by the agent, or the only way to answer. */
export const allowsOwnAnswer = (question: AgentQuestion) => question.isOther === true || !questionOptions(question).length;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => datePattern.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
// The date and time control gives local time without a zone; agents may also send full ISO times as starting text.
const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

function inputError(input: AgentQuestionInput | undefined, value: string): string | undefined {
	const kind = input?.kind ?? "text";
	if (kind === "number" || kind === "integer") {
		const number = Number(value.trim());
		if (!value.trim() || !Number.isFinite(number)) return "Enter a number.";
		if (kind === "integer" && !Number.isInteger(number)) return "Enter a whole number.";
		if (input?.min !== undefined && number < input.min) return `Enter ${input.min} or more.`;
		if (input?.max !== undefined && number > input.max) return `Enter ${input.max} or less.`;
		return;
	}
	if (kind === "boolean") return value === "true" || value === "false" ? undefined : "Choose yes or no.";
	if (input?.minLength !== undefined && value.length < input.minLength) return `Use at least ${input.minLength} characters.`;
	if (input?.maxLength !== undefined && value.length > input.maxLength) return `Use at most ${input.maxLength} characters.`;
	if (kind === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter an email address.";
	if (kind === "uri" && !URL.canParse(value)) return "Enter a full web address.";
	if (kind === "date" && !validDate(value)) return "Enter a date.";
	if (kind === "date-time" && (!dateTimePattern.test(value) || !Number.isFinite(Date.parse(value)))) return "Enter a date and time.";
}

/** Why these values do not answer the question, or undefined. A value matching an option's value picks it; anything else is the person's own answer. */
export function questionAnswerError(question: AgentQuestion, values: string[]): string | undefined {
	const options = questionOptions(question);
	const required = question.required !== false;
	if (!values.length) return required ? "Answer this question." : undefined;
	if (!question.multiSelect && values.length > 1) return "Choose one answer.";
	if (new Set(values).size !== values.length) return "Each answer must be different.";
	for (const value of values) {
		if (options.some(option => optionValue(option) === value)) continue;
		if (!allowsOwnAnswer(question)) return "Choose one of the options.";
		if (!value.trim()) {
			// Optional questions and editable starting text may be sent empty; otherwise an empty answer is no answer.
			if (required && question.initialAnswer === undefined) return "Answer this question.";
			continue;
		}
		const error = inputError(question.input, value);
		if (error) return error;
	}
}

type FieldType = FormField["type"];
/**
 * A form's fields as answer-panel questions, or undefined when the panel cannot ask them: a link to open,
 * a hidden field, a field shown only for another answer, or a type the caller excludes.
 */
export function formQuestions(form: AgentForm, types: readonly FieldType[], message = form.title): AgentQuestion[] | undefined {
	const questions: AgentQuestion[] = [];
	for (const field of form.fields) {
		if (field.type === "external" || !types.includes(field.type) || field.hidden || field.when?.length) return undefined;
		const header = (field.title?.trim() || field.key).slice(0, 200);
		const common = { id: field.key, header, question: field.description?.trim() || message.trim() || header, ...(field.required ? {} : { required: false }) };
		const options = "options" in field && field.options ? field.options.map(option => ({ label: option.label || option.value, value: option.value, ...(option.description ? { description: option.description } : {}) })) : [];
		if (field.type === "string") {
			const kind = field.format ?? "text";
			const input: AgentQuestionInput = { kind, ...(field.minLength !== undefined ? { minLength: field.minLength } : {}), ...(field.maxLength !== undefined ? { maxLength: field.maxLength } : {}) };
			questions.push({ ...common, options, isOther: field.custom === true || !options.length, input, ...(!options.length && field.default !== undefined ? { initialAnswer: field.default } : {}) });
		} else if (field.type === "number" || field.type === "integer") {
			const bound = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : undefined;
			const min = bound(field.minimum), max = bound(field.maximum);
			questions.push({ ...common, options: [], isOther: true, input: { kind: field.type, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) } });
		} else if (field.type === "boolean") questions.push({ ...common, options: [], input: { kind: "boolean" } });
		else if (field.type === "multiselect") questions.push({ ...common, options, multiSelect: true, isOther: field.custom === true });
		else return undefined;
	}
	return questions.length ? questions : undefined;
}

/** Answers from the panel in the form's own shape: numbers, yes or no, a list for multi-select and text otherwise. Empty answers are left out. */
export function formQuestionAnswer(form: AgentForm, answers: Record<string, string[]>): FormAnswer {
	const answer: FormAnswer = Object.create(null);
	for (const field of form.fields) {
		const values = (Object.hasOwn(answers, field.key) ? answers[field.key] : []).filter(value => value.trim().length > 0);
		if (!values.length) continue;
		if (field.type === "multiselect") answer[field.key] = values;
		else if (field.type === "number" || field.type === "integer") answer[field.key] = Number(values[0].trim());
		else if (field.type === "boolean") answer[field.key] = values[0] === "true";
		else if (field.type === "string") answer[field.key] = field.format === "date-time" && !/(Z|[+-]\d{2}:\d{2})$/.test(values[0]) && Number.isFinite(Date.parse(values[0])) ? new Date(values[0]).toISOString() : values.join(", ");
	}
	return answer;
}
