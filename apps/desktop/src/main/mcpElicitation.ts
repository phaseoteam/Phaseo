import { randomUUID } from "node:crypto";
import type { AgentCallbacks } from "./agentAdapter";
import { formAnswerError, type AgentForm, type FormField } from "../shared/agentForms";

type Request = { serverName: string; message: string; mode?: string; url?: string; requestedSchema?: unknown };
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported MCP form schema.");
	return value as Record<string, unknown>;
}
function choices(value: Record<string, unknown>) {
	if (Array.isArray(value.oneOf)) {
		if (value.oneOf.length > 1000) throw new Error("Too many MCP choices.");
		return value.oneOf.map(raw => { const item = object(raw); if (typeof item.const !== "string" || typeof item.title !== "string" || Object.keys(item).some(key => !["const", "title"].includes(key))) throw new Error("Unsupported MCP choice."); return { value: item.const, label: item.title }; });
	}
	if (!Array.isArray(value.enum) || value.enum.length > 1000 || value.enum.some(item => typeof item !== "string")) throw new Error("Unsupported MCP choices.");
	return value.enum.map((item, index) => ({ value: item as string, label: Array.isArray(value.enumNames) && typeof value.enumNames[index] === "string" ? value.enumNames[index] : item as string }));
}
export function elicitationForm(request: Request): AgentForm {
	const title = `${request.serverName}: ${request.message}`.slice(0, 2000);
	if (request.mode === "url") {
		const url = new URL(request.url ?? "");
		if (url.protocol !== "https:" || url.username || url.password) throw new Error("Unsupported MCP verification URL.");
		return { id: randomUUID(), title, fields: [{ type: "external", key: "confirmation", title: "Complete verification", url: url.href }] };
	}
	if (request.mode && request.mode !== "form") throw new Error("Unsupported MCP elicitation mode.");
	const schema = object(request.requestedSchema); const properties = object(schema.properties);
	if (schema.type !== "object" || Object.keys(properties).length > 100 || Object.keys(schema).some(key => !["$schema", "type", "properties", "required", "title", "description"].includes(key))) throw new Error("Unsupported MCP form schema.");
	const required = schema.required ?? [];
	if (!Array.isArray(required) || required.some(key => typeof key !== "string" || !Object.hasOwn(properties, key))) throw new Error("Unsupported MCP required fields.");
	const fields: FormField[] = Object.entries(properties).map(([key, raw]) => {
		const value = object(raw);
		const allowed = ["type", "title", "description", "default", ...(value.type === "string" ? ["minLength", "maxLength", "enum", "enumNames", "oneOf", "format"] : value.type === "number" || value.type === "integer" ? ["minimum", "maximum"] : value.type === "array" ? ["items", "minItems", "maxItems"] : [])];
		if (!key || key.length > 200 || Object.keys(value).some(name => !allowed.includes(name))) throw new Error("Unsupported MCP field schema.");
		const common = { key, required: required.includes(key), ...(typeof value.title === "string" ? { title: value.title.slice(0, 500) } : {}), ...(typeof value.description === "string" ? { description: value.description.slice(0, 2000) } : {}) };
		if (value.type === "string") {
			if (value.format !== undefined && !["email", "uri", "date", "date-time"].includes(String(value.format))) throw new Error("Unsupported MCP text format.");
			for (const bound of [value.minLength, value.maxLength]) if (bound !== undefined && (!Number.isSafeInteger(bound) || Number(bound) < 0)) throw new Error("Unsupported MCP text bounds.");
			return { ...common, type: "string", ...(typeof value.default === "string" ? { default: value.default } : {}), ...(value.format ? { format: value.format as "email" | "uri" | "date" | "date-time" } : {}), ...(value.minLength !== undefined ? { minLength: Number(value.minLength) } : {}), ...(value.maxLength !== undefined ? { maxLength: Number(value.maxLength) } : {}), ...(value.enum !== undefined || value.oneOf !== undefined ? { options: choices(value), custom: false } : {}) };
		}
		if (value.type === "number" || value.type === "integer") {
			for (const bound of [value.minimum, value.maximum]) if (bound !== undefined && (typeof bound !== "number" || !Number.isFinite(bound))) throw new Error("Unsupported MCP numeric bounds.");
			return { ...common, type: value.type, ...(typeof value.default === "number" ? { default: value.default } : {}), ...(value.minimum !== undefined ? { minimum: Number(value.minimum) } : {}), ...(value.maximum !== undefined ? { maximum: Number(value.maximum) } : {}) };
		}
		if (value.type === "boolean") return { ...common, type: "boolean", ...(typeof value.default === "boolean" ? { default: value.default } : {}) };
		if (value.type === "array") {
			const items = object(value.items);
			if (items.type !== "string" || Object.keys(items).some(name => !["type", "enum", "anyOf"].includes(name))) throw new Error("Unsupported MCP selection items.");
			for (const bound of [value.minItems, value.maxItems]) if (bound !== undefined && (!Number.isSafeInteger(bound) || Number(bound) < 0)) throw new Error("Unsupported MCP selection bounds.");
			return { ...common, type: "multiselect", options: choices(items.anyOf !== undefined ? { oneOf: items.anyOf } : items), custom: false, ...(Array.isArray(value.default) && value.default.every(item => typeof item === "string") ? { default: value.default as string[] } : {}), ...(value.minItems !== undefined ? { minItems: Number(value.minItems) } : {}), ...(value.maxItems !== undefined ? { maxItems: Number(value.maxItems) } : {}) };
		}
		throw new Error("Unsupported MCP field type.");
	});
	const [first, ...rest] = fields;
	if (!first) throw new Error("MCP form has no fields.");
	return { id: randomUUID(), title, fields: [first, ...rest] };
}

export async function respondMcpElicitation(request: Request, callbacks: AgentCallbacks, signal: AbortSignal) {
	if (!callbacks.onForm || signal.aborted) return { action: "cancel" as const };
	let form: AgentForm;
	try { form = elicitationForm(request); } catch { return { action: "decline" as const }; }
	const answer = await callbacks.onForm(form, signal);
	if (!answer || signal.aborted) return { action: "cancel" as const };
	if (formAnswerError(form, answer)) return { action: "decline" as const };
	return { action: "accept" as const, ...(request.mode === "url" ? {} : { content: answer }) };
}
