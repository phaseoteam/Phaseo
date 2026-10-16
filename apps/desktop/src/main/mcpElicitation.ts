import { randomUUID } from "node:crypto";
import type { AgentCallbacks } from "./agentAdapter";
import { formAnswerError, type AgentForm, type FormField } from "../shared/agentForms";
import { formQuestionAnswer, formQuestions } from "../shared/agentQuestions";
import type { ApprovalDecision } from "../shared/workspace";

type Request = { serverName: string; message: string; mode?: string; url?: string; requestedSchema?: unknown; _meta?: unknown };
function object(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Unsupported MCP form schema.");
	return value as Record<string, unknown>;
}
function choices(value: Record<string, unknown>) {
	if (Array.isArray(value.oneOf)) {
		if (value.oneOf.length > 1000) throw new Error("Too many MCP choices.");
		return value.oneOf.map(raw => { const item = object(raw); if (typeof item.const !== "string" || typeof item.title !== "string" || (item.description !== undefined && typeof item.description !== "string") || Object.keys(item).some(key => !["const", "title", "description"].includes(key))) throw new Error("Unsupported MCP choice."); return { value: item.const, label: item.title, ...(item.description ? { description: String(item.description).slice(0, 2000) } : {}) }; });
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

/** ACP marks absent values with null and allows _meta anywhere; MCP schemas have neither. Drop both so one reader serves the two. */
export function withoutNulls(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(withoutNulls);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).filter(([key, item]) => item !== null && key !== "_meta").map(([key, item]) => [key, withoutNulls(item)]));
}

/** Primitive fields go to the answer panel as questions; links, hidden or conditional fields keep the full form. */
const questionTypes = ["string", "number", "integer", "boolean", "multiselect"] as const;

export async function respondMcpElicitation(request: Request, callbacks: AgentCallbacks, signal: AbortSignal) {
	if ((!callbacks.onForm && !callbacks.onQuestion) || signal.aborted) return { action: "cancel" as const };
	let form: AgentForm;
	try { form = elicitationForm(request); } catch { return { action: "decline" as const }; }
	const questions = request.mode !== "url" && callbacks.onQuestion ? formQuestions(form, questionTypes, request.message) : undefined;
	if (questions) {
		// Dismissing cancels, as in T3 Code; an answer the form rejects falls back to the full form with the reason.
		const answers = await callbacks.onQuestion!(questions, { origin: request.serverName, signal });
		if (signal.aborted || !Object.keys(answers).length) return { action: "cancel" as const };
		const content = formQuestionAnswer(form, answers);
		const error = formAnswerError(form, content);
		if (!error) return { action: "accept" as const, content };
		form = { ...form, error };
	}
	if (!callbacks.onForm) return { action: "cancel" as const };
	const answer = await callbacks.onForm(form, signal);
	if (answer === "decline") return { action: "decline" as const };
	if (!answer || signal.aborted) return { action: "cancel" as const };
	if (formAnswerError(form, answer)) return { action: "decline" as const };
	return { action: "accept" as const, ...(request.mode === "url" ? {} : { content: answer }) };
}

const record = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const lasting = (value: string) => /session/i.test(value) ? "session" as const : /always|permanent|forever|persistent/i.test(value) ? "always" as const : undefined;
export type McpApprovalResponse = { action: "accept" | "decline"; content?: Record<string, unknown>; _meta?: { persist: "session" | "always" } };

/**
 * Codex (and codex-acp) ask before an MCP tool call with an elicitation marked _meta.codex_approval_kind. It belongs on the approval
 * card, as in T3 Code: Allow, Deny and, where it offers a lasting grant, Always allow. Undefined for real forms or approvals it cannot answer.
 */
export function mcpApprovalRequest(request: Request) {
	const meta = record(request._meta);
	if (typeof meta?.codex_approval_kind !== "string" || request.mode === "url") return undefined;
	const schema = record(request.requestedSchema); const properties = record(schema?.properties) ?? {};
	const required = Array.isArray(schema?.required) ? schema.required.filter((key): key is string => typeof key === "string") : [];
	const choices = (field: Record<string, unknown>) => Array.isArray(field.oneOf) ? field.oneOf.flatMap(option => { const value = record(option)?.const; return typeof value === "string" ? [value] : []; }) : Array.isArray(field.enum) ? field.enum.filter((value): value is string => typeof value === "string") : [];
	const lastingField = (key: string, field: Record<string, unknown>) => field.type === "boolean" && (!!lasting(key) || key.toLowerCase() === "persist" || !!lasting(String(field.title ?? "")) || !!lasting(String(field.description ?? "")));
	const offered = new Set<"session" | "always">();
	for (const value of (Array.isArray(meta.persist) ? meta.persist : [meta.persist]).filter((value): value is string => typeof value === "string")) { const scope = lasting(value); if (scope) offered.add(scope); }
	if (meta.allowPersistentApproval === true) offered.add("always");
	for (const [key, raw] of Object.entries(properties)) { const field = record(raw) ?? {}; for (const value of choices(field)) { const scope = lasting(value); if (scope) offered.add(scope); } if (lastingField(key, field)) offered.add("always"); }
	const persist = offered.has("session") ? "session" as const : offered.has("always") ? "always" as const : undefined;
	/** The reply: each field's own approve (or lasting) choice, else its default; decline when a required field has neither. */
	const response = (decision: ApprovalDecision): McpApprovalResponse => {
		if (decision === "decline" || decision === "never") return { action: "decline" };
		const scope = decision === "always" ? persist : undefined;
		const content: Record<string, unknown> = {};
		for (const [key, raw] of Object.entries(properties)) {
			const field = record(raw) ?? {};
			const chosen = choices(field).find(value => scope ? lasting(value) === scope : /once|accept|approve|allow/i.test(value) && !lasting(value));
			if (chosen !== undefined) content[key] = chosen;
			else if (lastingField(key, field)) content[key] = scope !== undefined;
			else if (field.default !== undefined && field.default !== null) content[key] = field.default;
		}
		if (required.some(key => !Object.hasOwn(content, key))) return { action: "decline" };
		return { action: "accept", ...(schema ? { content } : {}), ...(scope ? { _meta: { persist: scope } } : {}) };
	};
	if (response("accept").action !== "accept") return undefined;
	const app = text(meta.app_name) ?? text(meta.appName) ?? text(meta.app) ?? text(record(meta.target)?.app) ?? text(record(meta.target)?.name) ?? text(meta.connector_name) ?? text(meta.connectorName) ?? request.serverName;
	return { title: `Allow ${app}?`, description: request.message, ...(persist ? { always: persist === "session" ? "Allow for this session" : "Always allow" } : {}), response };
}
