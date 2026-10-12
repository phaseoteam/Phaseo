import type { FormInfo } from "@opencode/client";
import type { AgentForm, FormField } from "../shared/agentForms";

/** JSON responses encode non-finite numbers, while event fields are decoded. */
export function openCodeForm(form: FormInfo): AgentForm {
	const fields: FormField[] = form.fields.map(field => {
		if (field.type !== "number" && field.type !== "integer") return field;
		const finite = (value: typeof field.minimum, unbounded?: string) => {
			if (value === undefined || value === unbounded) return undefined;
			if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`OpenCode form ${form.title} contains an unsupported numeric value.`);
			return value;
		};
		return { ...field, minimum: finite(field.minimum, "-Infinity"), maximum: finite(field.maximum, "Infinity"), default: finite(field.default) };
	});
	if (!fields[0]) throw new Error("OpenCode returned an empty form.");
	return { id: form.id, title: form.title, fields: [fields[0], ...fields.slice(1)] };
}
