// Purpose: Apply a preset's prompt template to a request
// Why: Templates keep prompts in the preset, versioned with its routing, while
//      each request only sends the values that change
// How: Read `prompt: {id, variables}` before schema validation, then render the
//      preset's template and merge it into the protocol body before routing

import type { Endpoint } from "@core/types";
import {
	compilePromptTemplate,
	renderPromptTemplate,
	resolvePromptVariables,
	type PromptTemplateIssue,
	type RenderedPromptMessage,
	type RenderedPromptPart,
} from "@core/prompt-templates";
import type { PresetData } from "./types";

const TEMPLATE_ENDPOINTS = new Set<Endpoint>(["chat.completions", "responses", "messages"]);
/**
 * Stands in for `messages` on chat and Messages requests (whose schemas require
 * at least one) until the template fills them.
 */
const MESSAGES_PLACEHOLDER = Object.freeze({ role: "user", content: "\u0000prompt-template-placeholder" });

export type PromptReference = {
	/** The preset reference, e.g. "@support-triage" or "@publisher/support-triage". */
	id: string;
	variables: unknown;
};

export type PromptReferenceIssue = { reason: string; message: string; path: string[] };

function isPlainObject(value: unknown): value is Record<string, any> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read a template reference from the request. Only `prompt` objects whose id
 * names a preset ("@…") are ours; any other `prompt` value is left untouched.
 * Fills `model` from the reference and gives template-only requests the empty
 * message list the endpoint schema needs.
 */
export function extractPromptReference(rawBody: any, endpoint: Endpoint):
	| { ok: true; rawBody: any; reference: PromptReference | null }
	| { ok: false; issue: PromptReferenceIssue } {
	if (!TEMPLATE_ENDPOINTS.has(endpoint) || !isPlainObject(rawBody) || !isPlainObject(rawBody.prompt)) {
		return { ok: true, rawBody, reference: null };
	}
	const prompt = rawBody.prompt;
	const id = typeof prompt.id === "string" ? prompt.id.trim() : "";
	if (!id.startsWith("@")) return { ok: true, rawBody, reference: null };
	if (id.length < 2 || /\s/.test(id)) {
		return { ok: false, issue: { reason: "prompt_id_invalid", message: `"prompt.id" must name a preset, such as "@support-triage"`, path: ["prompt", "id"] } };
	}
	if (prompt.version !== undefined && prompt.version !== null) {
		return {
			ok: false,
			issue: { reason: "prompt_version_unsupported", message: `"prompt.version" is not supported yet; requests use the preset's published version`, path: ["prompt", "version"] },
		};
	}
	const model = typeof rawBody.model === "string" ? rawBody.model.trim() : "";
	if (model && model.toLowerCase() !== id.toLowerCase()) {
		return {
			ok: false,
			issue: {
				reason: "prompt_model_conflict",
				message: `"model" is "${model}" but "prompt.id" is "${id}". Leave "model" out, or set it to "${id}"`,
				path: ["model"],
			},
		};
	}

	const next: any = { ...rawBody, model: model || id };
	if (endpoint === "responses" && next.input === undefined) next.input = [];
	if (endpoint !== "responses" && (next.messages === undefined || (Array.isArray(next.messages) && next.messages.length === 0))) {
		next.messages = [MESSAGES_PLACEHOLDER];
	}
	return { ok: true, rawBody: next, reference: { id, variables: prompt.variables } };
}

/** Remove the messages placeholder after schema validation. */
export function withoutMessagesPlaceholder(body: any): any {
	if (!Array.isArray(body?.messages) || body.messages.length !== 1) return body;
	const [first] = body.messages;
	if (first?.role !== MESSAGES_PLACEHOLDER.role || first?.content !== MESSAGES_PLACEHOLDER.content) return body;
	return { ...body, messages: [] };
}

const TEMPLATE_REQUEST_FIELDS = ["tools", "tool_choice", "response_format", "text", "output_config"] as const;

/**
 * The request as capability checks should see it: without the `prompt`
 * reference (not a model parameter) and with the tools and response format the
 * template added, so providers that cannot honour them are filtered out.
 */
export function capabilityViewOfTemplatedRequest(rawBody: any, body: any): any {
	if (!isPlainObject(rawBody)) return rawBody;
	const view: any = { ...rawBody };
	delete view.prompt;
	for (const field of TEMPLATE_REQUEST_FIELDS) {
		if (view[field] === undefined && body?.[field] !== undefined) view[field] = body[field];
	}
	return view;
}

export type PromptTemplateApplication = {
	/** Variable names the request sent, for logs (values are not kept here). */
	variableNames: string[];
	/** Rendered message count. */
	messageCount: number;
};

/**
 * Render the preset's template with the request's variables and merge it into
 * the body: template messages go before the request's, the request wins on
 * tool_choice and response format, and tools are joined by name with the
 * request's definition kept on a clash. The preset system prompt is applied
 * afterwards by mergePresetWithBody, so it stays first.
 */
export function applyPresetPromptTemplate(args: {
	body: any;
	preset: PresetData;
	reference: PromptReference | null;
	endpoint: Endpoint;
}):
	| { ok: true; body: any; application: PromptTemplateApplication | null }
	| { ok: false; issues: PromptTemplateIssue[] } {
	const { preset, reference, endpoint } = args;
	const body = { ...args.body };
	delete body.prompt;
	const templateName = preset.slug ? `@${preset.slug}` : preset.name;
	const template = preset.config.prompt;

	if (template === null || template === undefined) {
		if (isPlainObject(reference?.variables) && Object.keys(reference.variables).length > 0) {
			return {
				ok: false,
				issues: [{
					path: ["prompt", "variables"],
					keyword: "template_variable_unknown",
					message: `Preset "${templateName}" has no prompt template, so it takes no variables`,
				}],
			};
		}
		return { ok: true, body, application: null };
	}
	if (!TEMPLATE_ENDPOINTS.has(endpoint)) {
		return {
			ok: false,
			issues: [{ path: ["model"], keyword: "template_endpoint_unsupported", message: `Preset "${templateName}" has a prompt template, which works with chat completions, responses and messages requests only` }],
		};
	}

	const compiled = compilePromptTemplate(template);
	if (compiled.ok === false) {
		// A template that fails validation was saved before a rule tightened, or
		// written outside the editor. Point at the preset, not at the request.
		return {
			ok: false,
			issues: compiled.issues.map((issue) => ({
				...issue,
				keyword: "preset_template_invalid",
				message: `Preset "${templateName}" has an invalid prompt template: ${issue.message}`,
			})),
		};
	}
	const variables = resolvePromptVariables(compiled.value, reference?.variables, { templateName });
	if (variables.ok === false) return variables;
	const rendered = renderPromptTemplate(compiled.value, variables.value);
	if (rendered.ok === false) return rendered;

	const merged = mergeRendered(body, rendered.value, compiled.value, endpoint);
	if (endpoint !== "responses" && (!Array.isArray(merged.messages) || merged.messages.length === 0)) {
		return {
			ok: false,
			issues: [{ path: ["messages"], keyword: "template_rendered_empty", message: `Preset "${templateName}" rendered no user or assistant messages; send "messages" or add one to the template` }],
		};
	}
	return {
		ok: true,
		body: merged,
		application: {
			variableNames: isPlainObject(reference?.variables) ? Object.keys(reference.variables).sort() : [],
			messageCount: rendered.value.length,
		},
	};
}

function textOf(content: RenderedPromptMessage["content"]): string {
	if (typeof content === "string") return content;
	return content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function splitSystem(messages: RenderedPromptMessage[]) {
	const system = messages.filter((m) => m.role === "system" || m.role === "developer").map((m) => textOf(m.content));
	const conversation = messages.filter((m) => m.role === "user" || m.role === "assistant");
	return { systemText: system.join("\n\n"), conversation };
}

type ChatTool = { type: "function"; function: { name: string; description?: string; parameters?: unknown; strict?: boolean } };

function templateChatTools(tools: unknown[] | undefined): ChatTool[] {
	return (tools ?? []).filter((tool): tool is ChatTool => isPlainObject(tool) && tool.type === "function" && isPlainObject(tool.function) && typeof tool.function.name === "string");
}

/** Template tools first, minus any whose name the request also defines. */
function joinTools(templateTools: any[], requestTools: unknown, nameOf: (tool: any) => string | null): any[] | undefined {
	const request = Array.isArray(requestTools) ? requestTools : [];
	if (!templateTools.length) return Array.isArray(requestTools) ? requestTools : undefined;
	const requestNames = new Set(request.map(nameOf).filter(Boolean));
	return [...templateTools.filter((tool) => !requestNames.has(nameOf(tool))), ...request];
}

function dataUrlSource(url: string): { type: "base64"; media_type: string; data: string } | null {
	const match = /^data:([^;,]+);base64,(.*)$/i.exec(url);
	return match ? { type: "base64", media_type: match[1], data: match[2] } : null;
}

function mergeRendered(body: any, rendered: RenderedPromptMessage[], template: { tools?: unknown[]; tool_choice?: unknown; response_format?: unknown }, endpoint: Endpoint): any {
	const tools = templateChatTools(template.tools);

	if (endpoint === "chat.completions") {
		const merged = { ...body, messages: [...rendered, ...(Array.isArray(body.messages) ? body.messages : [])] };
		const joined = joinTools(tools, body.tools, (tool) => tool?.function?.name ?? null);
		if (joined) merged.tools = joined;
		if (merged.tool_choice === undefined && template.tool_choice !== undefined) merged.tool_choice = template.tool_choice;
		if (merged.response_format === undefined && template.response_format !== undefined) merged.response_format = template.response_format;
		return merged;
	}

	const { systemText, conversation } = splitSystem(rendered);

	if (endpoint === "responses") {
		const merged = { ...body };
		if (systemText) {
			if (typeof merged.instructions === "string" && merged.instructions) merged.instructions = `${systemText}\n\n${merged.instructions}`;
			else if (Array.isArray(merged.instructions)) merged.instructions = [{ type: "input_text", text: `${systemText}\n\n` }, ...merged.instructions];
			else merged.instructions = systemText;
		}
		if (conversation.length) {
			const requestInput = typeof merged.input === "string"
				? [{ role: "user", content: merged.input }]
				: Array.isArray(merged.input) ? merged.input : merged.input == null ? [] : [merged.input];
			merged.input = [
				...conversation.map((message) => ({
					role: message.role,
					content: message.role === "assistant" || typeof message.content === "string"
						? textOf(message.content)
						: message.content.map(toResponsesPart),
				})),
				...requestInput,
			];
		}
		const joined = joinTools(
			tools.map((tool) => ({ type: "function", name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters, strict: tool.function.strict })),
			body.tools,
			(tool) => (tool?.type === "function" ? tool.name ?? null : null),
		);
		if (joined) merged.tools = joined;
		if (merged.tool_choice === undefined && template.tool_choice !== undefined) {
			const choice: any = template.tool_choice;
			merged.tool_choice = isPlainObject(choice) && choice.type === "function" && isPlainObject(choice.function)
				? { type: "function", name: choice.function.name }
				: choice;
		}
		const format = responsesFormat(template.response_format);
		if (format && merged.text?.format === undefined) merged.text = { ...(isPlainObject(merged.text) ? merged.text : {}), format };
		return merged;
	}

	// messages
	const merged = { ...body };
	if (systemText) {
		if (Array.isArray(merged.system)) merged.system = [{ type: "text", text: `${systemText}\n\n` }, ...merged.system];
		else if (typeof merged.system === "string" && merged.system) merged.system = `${systemText}\n\n${merged.system}`;
		else merged.system = systemText;
	}
	merged.messages = [
		...conversation.map((message) => ({
			role: message.role,
			content: message.role === "assistant" || typeof message.content === "string"
				? textOf(message.content)
				: message.content.map(toMessagesPart),
		})),
		...(Array.isArray(merged.messages) ? merged.messages : []),
	];
	const joined = joinTools(
		tools.map((tool) => ({ name: tool.function.name, ...(tool.function.description ? { description: tool.function.description } : {}), input_schema: tool.function.parameters ?? { type: "object", properties: {} } })),
		body.tools,
		(tool) => (typeof tool?.name === "string" ? tool.name : null),
	);
	if (joined) merged.tools = joined;
	if (merged.tool_choice === undefined && template.tool_choice !== undefined) {
		const choice = messagesToolChoice(template.tool_choice);
		if (choice) merged.tool_choice = choice;
	}
	const responseFormat: any = template.response_format;
	if (responseFormat?.type === "json_schema" && isPlainObject(responseFormat.json_schema?.schema) && merged.output_config?.format === undefined) {
		merged.output_config = { ...(isPlainObject(merged.output_config) ? merged.output_config : {}), format: { type: "json_schema", schema: responseFormat.json_schema.schema } };
	}
	return merged;
}

function toResponsesPart(part: RenderedPromptPart) {
	return part.type === "text" ? { type: "input_text", text: part.text } : { type: "input_image", image_url: part.image_url.url };
}

function toMessagesPart(part: RenderedPromptPart) {
	if (part.type === "text") return { type: "text", text: part.text };
	const base64 = dataUrlSource(part.image_url.url);
	return { type: "image", source: base64 ?? { type: "url", url: part.image_url.url } };
}

function responsesFormat(format: any): Record<string, unknown> | null {
	if (!isPlainObject(format)) return null;
	if (format.type === "json_schema" && isPlainObject(format.json_schema)) {
		const { name, schema, strict, description } = format.json_schema;
		return { type: "json_schema", name: name ?? "response", schema, ...(strict !== undefined ? { strict } : {}), ...(description ? { description } : {}) };
	}
	if (format.type === "json_object" || format.type === "text") return { type: format.type };
	return null;
}

function messagesToolChoice(choice: any): Record<string, unknown> | null {
	if (choice === "auto") return { type: "auto" };
	if (choice === "required") return { type: "any" };
	if (choice === "none") return { type: "none" };
	if (isPlainObject(choice) && choice.type === "function" && typeof choice.function?.name === "string") return { type: "tool", name: choice.function.name };
	return null;
}

/** A text value the request sent as a template variable, located in the raw body. */
export type TemplateVariableTarget = { text: string; rawPath: Array<string | number> };

const MAX_VARIABLE_TARGETS = 500;

/**
 * Text values in `prompt.variables`. Guardrails scan them as user content:
 * a value may be rendered into a system message, which they otherwise skip.
 */
export function collectTemplateVariableTargets(variables: unknown): TemplateVariableTarget[] {
	const targets: TemplateVariableTarget[] = [];
	const walk = (value: unknown, path: Array<string | number>, depth: number) => {
		if (targets.length >= MAX_VARIABLE_TARGETS || depth > 8) return;
		if (typeof value === "string") {
			if (value.trim() && !/^data:/i.test(value)) targets.push({ text: value, rawPath: path });
		} else if (Array.isArray(value)) {
			value.forEach((item, index) => walk(item, [...path, index], depth + 1));
		} else if (isPlainObject(value)) {
			for (const [key, item] of Object.entries(value)) walk(item, [...path, key], depth + 1);
		}
	};
	if (isPlainObject(variables)) walk(variables, ["prompt", "variables"], 0);
	return targets;
}

/**
 * Replace a redacted variable value wherever the template rendered it. Values
 * are inserted verbatim, so an exact string replacement finds every copy.
 */
export function replaceRenderedValue(root: unknown, original: string, replacement: string): void {
	const visit = (container: any, key: string | number) => {
		const value = container[key];
		if (typeof value === "string") {
			if (value.includes(original)) container[key] = value.split(original).join(replacement);
		} else if (Array.isArray(value)) {
			value.forEach((_, index) => visit(value, index));
		} else if (isPlainObject(value)) {
			for (const child of Object.keys(value)) visit(value, child);
		}
	};
	if (Array.isArray(root)) root.forEach((_, index) => visit(root, index));
	else if (isPlainObject(root)) for (const key of Object.keys(root)) visit(root, key);
}
