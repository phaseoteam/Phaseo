import type { FormInfo1 } from "@opencode/client";

export type AgentForm = Pick<FormInfo1, "id" | "title" | "fields"> & { error?: string };
export type FormAnswer = Record<string, string | number | boolean | string[]>;
export type FormDraft = Record<string, FormAnswer[string] | undefined>;
export type FormField = AgentForm["fields"][number];

export function fieldActive(field: FormField, answer: FormAnswer) {
	return field.type === "external" || (field.when ?? []).every(condition => {
		if (!Object.hasOwn(answer, condition.key)) return false;
		const value = answer[condition.key]; const matches = Array.isArray(value) ? value.some(item => item === condition.value) : value === condition.value;
		return condition.op === "eq" ? matches : !matches;
	});
}

export function collectFormAnswer(form: AgentForm, draft: FormDraft): FormAnswer {
	const answer: FormAnswer = Object.create(null);
	for (const field of form.fields) {
		if (!fieldActive(field, answer)) continue;
		const value = Object.hasOwn(draft, field.key) ? draft[field.key] : field.type !== "external" ? field.default : undefined;
		if (value !== undefined) answer[field.key] = value;
	}
	return answer;
}

export function formAnswerError(form: AgentForm, answer: FormAnswer): string | undefined {
	const fields = new Map(form.fields.map(field => [field.key, field]));
	if (Object.keys(answer).some(key => !fields.has(key))) return "The answer contains an unknown field.";
	for (const field of form.fields) {
		const value = Object.hasOwn(answer, field.key) ? answer[field.key] : undefined;
		const label = field.title ?? field.key;
		if (!fieldActive(field, answer)) { if (value !== undefined) return `${label} is inactive.`; continue; }
		if (field.type === "external") { if (value !== true) return `Confirm ${label} before continuing.`; continue; }
		if (value === undefined) { if (field.required) return `Enter ${label}.`; continue; }
		if (field.type === "string") {
			if (typeof value !== "string") return `${label} requires text.`;
			if ((field.required && !value.length) || (field.minLength !== undefined && value.length < field.minLength) || (field.maxLength !== undefined && value.length > field.maxLength)) return `Check the length of ${label}.`;
			if (field.options && !field.custom && !field.options.some(option => option.value === value)) return `Choose an option for ${label}.`;
			if (field.format === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `Enter an email address for ${label}.`;
			if (field.format === "uri" && !URL.canParse(value)) return `Enter a URI for ${label}.`;
			// Native services validate their own patterns and date formats. Do not
			// execute provider-supplied regular expressions in Electron's main process.
		} else if (field.type === "number" || field.type === "integer") {
			if (typeof value !== "number" || !Number.isFinite(value) || (field.type === "integer" && !Number.isInteger(value)) || (field.minimum !== undefined && value < field.minimum) || (field.maximum !== undefined && value > field.maximum)) return `Enter a valid ${field.type} for ${label}.`;
		} else if (field.type === "boolean") {
			if (typeof value !== "boolean") return `${label} requires yes or no.`;
		} else if (field.type === "multiselect") {
			if (!Array.isArray(value) || value.some(item => typeof item !== "string") || (field.required && !value.length) || (field.minItems !== undefined && value.length < field.minItems) || (field.maxItems !== undefined && value.length > field.maxItems) || (!field.custom && value.some(item => !field.options.some(option => option.value === item)))) return `Check the selections for ${label}.`;
		}
	}
}
