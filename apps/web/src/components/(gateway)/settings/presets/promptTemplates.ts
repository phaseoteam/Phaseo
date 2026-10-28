// Generated from packages/shared/prompt-templates/index.ts by scripts/sync-prompt-templates.mjs. Do not edit.
// Prompt templates: messages with {{variables}} stored on a preset and filled in
// by the gateway for each request.
//
// This is the one definition of the template syntax, the variable rules and the
// limits. The gateway (rendering), the control API (validation on save) and the
// preset editor (live preview) each use a generated copy
// (scripts/sync-prompt-templates.mjs), so a template that previews correctly
// renders the same way in production. Keep it dependency-free.
//
// Syntax ("mustache-v1"), a logic-less subset of Mustache:
//   {{name}} {{a.b}}      insert a value (strings as-is, numbers and booleans as text,
//                         objects and arrays as JSON, missing optional values as "")
//   {{#name}}…{{/name}}   render once when truthy, or once per item of an array;
//                         inside, {{.}} is the current item and its fields resolve first
//   {{^name}}…{{/name}}   render when falsy or an empty array
//   {{! comment }}        removed
//   \{{                   a literal "{{"
// Partials, lambdas, delimiter changes and unescaped forms ({{{ }}}, {{& }}) are
// rejected. Nothing is ever evaluated: templates are parsed into a tree and the
// tree is walked under fixed limits, so rendering is safe on Workers (no eval)
// and its cost is bounded by PROMPT_TEMPLATE_LIMITS.
//
// Templates are rendered per string, after the request JSON is parsed. A variable
// can change the text of a message but never the structure of the request.

export const PROMPT_TEMPLATE_SYNTAX = "mustache-v1";

export const PROMPT_TEMPLATE_LIMITS = {
	/** Total characters across every template string in one preset. */
	maxTemplateChars: 48_000,
	maxMessages: 64,
	maxVariables: 64,
	maxVariableNameLength: 64,
	/** Section nesting depth. */
	maxDepth: 8,
	/** Section iterations across one render, all loops together. */
	maxLoopIterations: 1_000,
	/** Characters of rendered text across one render. */
	maxOutputChars: 1_000_000,
	/** JSON size of the variables object a request sends. */
	maxVariablesBytes: 262_144,
	maxEnumValues: 100,
	maxDescriptionLength: 500,
} as const;

export const PROMPT_TEMPLATE_ROLES = ["system", "developer", "user", "assistant"] as const;
export type PromptTemplateRole = (typeof PROMPT_TEMPLATE_ROLES)[number];

/** "any" accepts any JSON value; "image" fills a whole content part. */
export const PROMPT_VARIABLE_TYPES = ["string", "number", "boolean", "enum", "array", "object", "any", "image"] as const;
export type PromptVariableType = (typeof PROMPT_VARIABLE_TYPES)[number];

export type PromptVariableSpec = {
	type: PromptVariableType;
	required?: boolean;
	default?: unknown;
	description?: string;
	/** Allowed values when type is "enum". */
	enum?: string[];
	/** Maximum characters when type is "string". */
	max_length?: number;
};

/** A whole content part filled from an image variable. */
export type PromptTemplateVariablePart = { type: "variable"; name: string };
export type PromptTemplateTextPart = { type: "text"; text: string };
export type PromptTemplatePart = PromptTemplateTextPart | PromptTemplateVariablePart;

export type PromptTemplateMessage = {
	role: PromptTemplateRole;
	content: string | PromptTemplatePart[];
};

/**
 * The `prompt` block of a preset config. Tools and response_format use the chat
 * completions shapes; the gateway converts them for each endpoint.
 */
export type PromptTemplate = {
	syntax?: typeof PROMPT_TEMPLATE_SYNTAX;
	messages: PromptTemplateMessage[];
	variables?: Record<string, PromptVariableSpec>;
	tools?: unknown[];
	tool_choice?: unknown;
	response_format?: unknown;
};

/** Rendered content uses chat completions part shapes. */
export type RenderedPromptPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export type RenderedPromptMessage = {
	role: PromptTemplateRole;
	content: string | RenderedPromptPart[];
};

export type PromptTemplateIssue = {
	path: Array<string | number>;
	keyword: string;
	message: string;
	params?: Record<string, unknown>;
};

export type PromptTemplateResult<T> = { ok: true; value: T } | { ok: false; issues: PromptTemplateIssue[] };

// ---------------------------------------------------------------------------
// Parsing

type Node =
	| { kind: "text"; text: string }
	| { kind: "var"; path: string[] }
	| { kind: "section"; path: string[]; inverted: boolean; children: Node[] };

/** A parsed template string; parse once, render many times. */
export type ParsedTemplateString = { nodes: Node[] };

const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const FORBIDDEN_NAMES = new Set(["__proto__", "constructor", "prototype"]);

function parsePath(raw: string): string[] | null {
	if (raw === ".") return ["."];
	const segments = raw.split(".");
	for (const segment of segments) {
		if (!NAME_PATTERN.test(segment) || FORBIDDEN_NAMES.has(segment)) return null;
		if (segment.length > PROMPT_TEMPLATE_LIMITS.maxVariableNameLength) return null;
	}
	return segments;
}

function syntaxIssue(path: Array<string | number>, message: string, params?: Record<string, unknown>): PromptTemplateIssue {
	return { path, keyword: "template_syntax", message, ...(params ? { params } : {}) };
}

/**
 * Parse one template string. `path` locates it in the preset for error messages,
 * and `offset` positions are character offsets into the string.
 */
export function parseTemplateString(
	source: string,
	path: Array<string | number> = [],
): PromptTemplateResult<ParsedTemplateString> {
	const root: Node[] = [];
	const stack: Array<{ node: Extract<Node, { kind: "section" }>; raw: string; offset: number }> = [];
	const current = () => (stack.length ? stack[stack.length - 1].node.children : root);
	let text = "";
	let index = 0;

	const flush = () => {
		if (text) current().push({ kind: "text", text });
		text = "";
	};

	while (index < source.length) {
		const open = source.indexOf("{{", index);
		if (open === -1) {
			text += source.slice(index);
			break;
		}
		if (open > 0 && source[open - 1] === "\\") {
			text += source.slice(index, open - 1) + "{{";
			index = open + 2;
			continue;
		}
		text += source.slice(index, open);
		const close = source.indexOf("}}", open + 2);
		if (close === -1) {
			return { ok: false, issues: [syntaxIssue(path, `Unclosed tag at character ${open}: add "}}"`, { offset: open })] };
		}
		const inner = source.slice(open + 2, close);
		index = close + 2;
		const sigil = inner[0];

		if (sigil === "!") continue;
		if (sigil === "{" || sigil === "&" || sigil === ">" || sigil === "=" || sigil === "<" || sigil === "$") {
			return {
				ok: false,
				issues: [syntaxIssue(path, `"{{${inner}}}" at character ${open} is not supported. Use {{name}}, {{#name}}, {{^name}} or {{! comment }}; write \\{{ for literal braces`, { offset: open })],
			};
		}

		const isOpenSection = sigil === "#" || sigil === "^";
		const isCloseSection = sigil === "/";
		const rawName = (isOpenSection || isCloseSection ? inner.slice(1) : inner).trim();
		const parsed = parsePath(rawName);
		if (!parsed) {
			return {
				ok: false,
				issues: [syntaxIssue(path, `"${rawName}" at character ${open} is not a valid variable name. Use letters, digits and _, joined with dots`, { offset: open, name: rawName })],
			};
		}

		if (isOpenSection) {
			if (parsed[0] === ".") {
				return { ok: false, issues: [syntaxIssue(path, `A section cannot open on "." (character ${open})`, { offset: open })] };
			}
			if (stack.length >= PROMPT_TEMPLATE_LIMITS.maxDepth) {
				return {
					ok: false,
					issues: [{ path, keyword: "template_limit_exceeded", message: `Sections nest deeper than ${PROMPT_TEMPLATE_LIMITS.maxDepth} levels at character ${open}`, params: { limit: "maxDepth", offset: open } }],
				};
			}
			flush();
			const node: Extract<Node, { kind: "section" }> = { kind: "section", path: parsed, inverted: sigil === "^", children: [] };
			current().push(node);
			stack.push({ node, raw: rawName, offset: open });
			continue;
		}

		if (isCloseSection) {
			// Text before the closing tag belongs inside the section.
			flush();
			const top = stack.pop();
			if (!top) {
				return { ok: false, issues: [syntaxIssue(path, `"{{/${rawName}}}" at character ${open} closes a section that was never opened`, { offset: open })] };
			}
			if (top.raw !== rawName) {
				return {
					ok: false,
					issues: [syntaxIssue(path, `"{{/${rawName}}}" at character ${open} does not match "{{${top.node.inverted ? "^" : "#"}${top.raw}}}" opened at character ${top.offset}`, { offset: open })],
				};
			}
			continue;
		}

		flush();
		current().push({ kind: "var", path: parsed });
	}

	if (stack.length) {
		const top = stack[stack.length - 1];
		return { ok: false, issues: [syntaxIssue(path, `"{{${top.node.inverted ? "^" : "#"}${top.raw}}}" at character ${top.offset} is never closed`, { offset: top.offset })] };
	}
	flush();
	return { ok: true, value: { nodes: root } };
}

/**
 * Variable names a parsed string refers to at the top level: names outside any
 * section, and section names themselves. Names inside a section may be fields of
 * the section's value, so they are only reported when no enclosing section could
 * supply them (`{{#items}}{{title}}{{/items}}` reports `items`, not `title`).
 */
export function referencedVariables(parsed: ParsedTemplateString): Map<string, "text" | "section"> {
	const names = new Map<string, "text" | "section">();
	const walk = (nodes: Node[], depth: number) => {
		for (const node of nodes) {
			if (node.kind === "var") {
				if (depth === 0 && node.path[0] !== ".") names.set(node.path[0], "text");
			} else if (node.kind === "section") {
				if (depth === 0 && !names.has(node.path[0])) names.set(node.path[0], "section");
				walk(node.children, depth + 1);
			}
		}
	};
	walk(parsed.nodes, 0);
	return names;
}

// ---------------------------------------------------------------------------
// Rendering

type RenderBudget = { iterations: number; chars: number };

class RenderLimitError extends Error {
	constructor(readonly limit: "maxLoopIterations" | "maxOutputChars") {
		super(limit);
	}
}

function own(value: unknown, key: string): unknown {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
	return Object.prototype.hasOwnProperty.call(value, key) ? (value as Record<string, unknown>)[key] : undefined;
}

function lookup(scopes: unknown[], path: string[]): unknown {
	if (path[0] === ".") return scopes[scopes.length - 1];
	let value: unknown = undefined;
	for (let i = scopes.length - 1; i >= 0; i -= 1) {
		const scope = scopes[i];
		if (scope !== null && typeof scope === "object" && !Array.isArray(scope) && Object.prototype.hasOwnProperty.call(scope, path[0])) {
			value = (scope as Record<string, unknown>)[path[0]];
			break;
		}
	}
	for (let i = 1; i < path.length; i += 1) value = own(value, path[i]);
	return value;
}

function isTruthy(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	return value !== undefined && value !== null && value !== false && value !== "";
}

function stringify(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (isImageValue(value)) return imageUrlOf(value) ?? "";
	return JSON.stringify(value);
}

function renderNodes(nodes: Node[], scopes: unknown[], budget: RenderBudget, out: string[]): void {
	for (const node of nodes) {
		if (node.kind === "text") {
			append(out, node.text, budget);
		} else if (node.kind === "var") {
			append(out, stringify(lookup(scopes, node.path)), budget);
		} else {
			const value = lookup(scopes, node.path);
			if (node.inverted) {
				if (!isTruthy(value)) renderNodes(node.children, scopes, budget, out);
				continue;
			}
			if (!isTruthy(value)) continue;
			const items = Array.isArray(value) ? value : [value];
			for (const item of items) {
				budget.iterations += 1;
				if (budget.iterations > PROMPT_TEMPLATE_LIMITS.maxLoopIterations) throw new RenderLimitError("maxLoopIterations");
				renderNodes(node.children, [...scopes, item], budget, out);
			}
		}
	}
}

function append(out: string[], text: string, budget: RenderBudget): void {
	if (!text) return;
	budget.chars += text.length;
	if (budget.chars > PROMPT_TEMPLATE_LIMITS.maxOutputChars) throw new RenderLimitError("maxOutputChars");
	out.push(text);
}

// ---------------------------------------------------------------------------
// Template validation (on save, and again before rendering)

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

type CompiledMessage = {
	role: PromptTemplateRole;
	/** A plain string message, or parts in order. */
	content: ParsedTemplateString | Array<{ kind: "text"; parsed: ParsedTemplateString } | { kind: "variable"; name: string }>;
};

export type CompiledPromptTemplate = {
	messages: CompiledMessage[];
	/** Declared variables plus implicit ones the messages refer to. */
	variables: Record<string, PromptVariableSpec>;
	tools?: unknown[];
	tool_choice?: unknown;
	response_format?: unknown;
};

function validateSpec(name: string, spec: unknown, issues: PromptTemplateIssue[]): PromptVariableSpec | null {
	const path = ["prompt", "variables", name];
	if (!NAME_PATTERN.test(name) || FORBIDDEN_NAMES.has(name) || name.length > PROMPT_TEMPLATE_LIMITS.maxVariableNameLength) {
		issues.push({ path, keyword: "template_variable_name", message: `"${name}" is not a valid variable name. Use letters, digits and _, up to ${PROMPT_TEMPLATE_LIMITS.maxVariableNameLength} characters, starting with a letter or _` });
		return null;
	}
	if (!isPlainObject(spec)) {
		issues.push({ path, keyword: "template_variable_spec", message: `Variable "${name}" must be an object such as {"type":"string"}` });
		return null;
	}
	const type = spec.type ?? "string";
	if (!PROMPT_VARIABLE_TYPES.includes(type as PromptVariableType)) {
		issues.push({ path: [...path, "type"], keyword: "template_variable_spec", message: `Variable "${name}" has unknown type "${String(type)}". Use one of: ${PROMPT_VARIABLE_TYPES.join(", ")}` });
		return null;
	}
	const result: PromptVariableSpec = { type: type as PromptVariableType };
	if (spec.required !== undefined) {
		if (typeof spec.required !== "boolean") {
			issues.push({ path: [...path, "required"], keyword: "template_variable_spec", message: `"required" on "${name}" must be true or false` });
		} else result.required = spec.required;
	}
	if (spec.description !== undefined) {
		if (typeof spec.description !== "string" || spec.description.length > PROMPT_TEMPLATE_LIMITS.maxDescriptionLength) {
			issues.push({ path: [...path, "description"], keyword: "template_variable_spec", message: `"description" on "${name}" must be text of at most ${PROMPT_TEMPLATE_LIMITS.maxDescriptionLength} characters` });
		} else result.description = spec.description;
	}
	if (result.type === "enum") {
		const values = spec.enum;
		if (!Array.isArray(values) || values.length === 0 || values.length > PROMPT_TEMPLATE_LIMITS.maxEnumValues || !values.every((v) => typeof v === "string")) {
			issues.push({ path: [...path, "enum"], keyword: "template_variable_spec", message: `Enum variable "${name}" needs "enum": a list of 1 to ${PROMPT_TEMPLATE_LIMITS.maxEnumValues} strings` });
		} else result.enum = values as string[];
	} else if (spec.enum !== undefined) {
		issues.push({ path: [...path, "enum"], keyword: "template_variable_spec", message: `"enum" only applies to variables of type "enum"` });
	}
	if (spec.max_length !== undefined) {
		if (result.type !== "string" || typeof spec.max_length !== "number" || !Number.isInteger(spec.max_length) || spec.max_length < 1) {
			issues.push({ path: [...path, "max_length"], keyword: "template_variable_spec", message: `"max_length" applies to string variables and must be a positive whole number` });
		} else result.max_length = spec.max_length;
	}
	if (spec.default !== undefined) {
		if (result.required) {
			issues.push({ path: [...path, "default"], keyword: "template_variable_spec", message: `Variable "${name}" is required, so it cannot have a default` });
		} else {
			const problem = checkValue(result, spec.default);
			if (problem) issues.push({ path: [...path, "default"], keyword: "template_variable_spec", message: `Default for "${name}" ${problem}` });
			else result.default = spec.default;
		}
	}
	return result;
}

/**
 * Validate and parse a preset's `prompt` block. Returns every problem found so
 * the editor can show them together.
 */
export function compilePromptTemplate(input: unknown): PromptTemplateResult<CompiledPromptTemplate> {
	const issues: PromptTemplateIssue[] = [];
	if (!isPlainObject(input)) {
		return { ok: false, issues: [{ path: ["prompt"], keyword: "template_invalid", message: `"prompt" must be an object with a "messages" list` }] };
	}
	if (input.syntax !== undefined && input.syntax !== PROMPT_TEMPLATE_SYNTAX) {
		issues.push({ path: ["prompt", "syntax"], keyword: "template_invalid", message: `Unknown template syntax "${String(input.syntax)}"; use "${PROMPT_TEMPLATE_SYNTAX}"` });
	}

	const declared: Record<string, PromptVariableSpec> = {};
	if (input.variables !== undefined) {
		if (!isPlainObject(input.variables)) {
			issues.push({ path: ["prompt", "variables"], keyword: "template_invalid", message: `"variables" must be an object keyed by variable name` });
		} else {
			const entries = Object.entries(input.variables);
			if (entries.length > PROMPT_TEMPLATE_LIMITS.maxVariables) {
				issues.push({ path: ["prompt", "variables"], keyword: "template_limit_exceeded", message: `A template can declare at most ${PROMPT_TEMPLATE_LIMITS.maxVariables} variables`, params: { limit: "maxVariables" } });
			}
			for (const [name, spec] of entries.slice(0, PROMPT_TEMPLATE_LIMITS.maxVariables)) {
				const valid = validateSpec(name, spec, issues);
				if (valid) declared[name] = valid;
			}
		}
	}

	const messages: CompiledMessage[] = [];
	const referenced = new Map<string, "text" | "section" | "part">();
	let templateChars = 0;
	if (!Array.isArray(input.messages)) {
		issues.push({ path: ["prompt", "messages"], keyword: "template_invalid", message: `"messages" must be a list` });
	} else {
		if (input.messages.length > PROMPT_TEMPLATE_LIMITS.maxMessages) {
			issues.push({ path: ["prompt", "messages"], keyword: "template_limit_exceeded", message: `A template can have at most ${PROMPT_TEMPLATE_LIMITS.maxMessages} messages`, params: { limit: "maxMessages" } });
		}
		input.messages.slice(0, PROMPT_TEMPLATE_LIMITS.maxMessages).forEach((message, index) => {
			const path: Array<string | number> = ["prompt", "messages", index];
			if (!isPlainObject(message) || !PROMPT_TEMPLATE_ROLES.includes(message.role as PromptTemplateRole)) {
				issues.push({ path: [...path, "role"], keyword: "template_invalid", message: `Message ${index + 1} needs a role: ${PROMPT_TEMPLATE_ROLES.join(", ")}` });
				return;
			}
			const role = message.role as PromptTemplateRole;
			const parseText = (text: string, textPath: Array<string | number>) => {
				templateChars += text.length;
				const parsed = parseTemplateString(text, textPath);
				if (parsed.ok === false) {
					issues.push(...parsed.issues);
					return null;
				}
				for (const [name, usage] of referencedVariables(parsed.value)) {
					if (referenced.get(name) !== "part" && referenced.get(name) !== "text") referenced.set(name, usage);
				}
				return parsed.value;
			};
			if (typeof message.content === "string") {
				const parsed = parseText(message.content, [...path, "content"]);
				if (parsed) messages.push({ role, content: parsed });
				return;
			}
			if (!Array.isArray(message.content)) {
				issues.push({ path: [...path, "content"], keyword: "template_invalid", message: `Message ${index + 1} content must be text or a list of parts` });
				return;
			}
			const parts: Extract<CompiledMessage["content"], unknown[]> = [];
			message.content.forEach((part, partIndex) => {
				const partPath = [...path, "content", partIndex];
				if (isPlainObject(part) && part.type === "text" && typeof part.text === "string") {
					const parsed = parseText(part.text, [...partPath, "text"]);
					if (parsed) parts.push({ kind: "text", parsed });
				} else if (isPlainObject(part) && part.type === "variable" && typeof part.name === "string") {
					if (role === "system" || role === "developer" || role === "assistant") {
						issues.push({ path: partPath, keyword: "template_invalid", message: `Image variables can only be used in user messages` });
					} else if (!NAME_PATTERN.test(part.name) || FORBIDDEN_NAMES.has(part.name)) {
						issues.push({ path: [...partPath, "name"], keyword: "template_variable_name", message: `"${part.name}" is not a valid variable name` });
					} else {
						referenced.set(part.name, "part");
						parts.push({ kind: "variable", name: part.name });
					}
				} else {
					issues.push({ path: partPath, keyword: "template_invalid", message: `Parts must be {"type":"text","text":…} or {"type":"variable","name":…}` });
				}
			});
			messages.push({ role, content: parts });
		});
	}
	if (templateChars > PROMPT_TEMPLATE_LIMITS.maxTemplateChars) {
		issues.push({ path: ["prompt", "messages"], keyword: "template_limit_exceeded", message: `Template text is ${templateChars} characters; the limit is ${PROMPT_TEMPLATE_LIMITS.maxTemplateChars}`, params: { limit: "maxTemplateChars" } });
	}

	const variables: Record<string, PromptVariableSpec> = { ...declared };
	for (const [name, usage] of referenced) {
		const spec = declared[name];
		if (!spec) {
			// Undeclared names are required text, or a required image when used as a
			// part. A name used only to open sections is optional and takes any value.
			variables[name] = usage === "section"
				? { type: "any", required: false }
				: { type: usage === "part" ? "image" : "string", required: true };
			continue;
		}
		if (usage === "part" && spec.type !== "image") {
			issues.push({ path: ["prompt", "variables", name, "type"], keyword: "template_variable_spec", message: `"${name}" is used as an image part, so its type must be "image"` });
		}
		if (usage !== "part" && spec.type === "image") {
			issues.push({ path: ["prompt", "variables", name, "type"], keyword: "template_variable_spec", message: `Image variable "${name}" can only fill a whole part ({"type":"variable","name":"${name}"}), not text` });
		}
	}

	for (const key of ["tools", "tool_choice", "response_format"] as const) {
		if (input[key] === undefined) continue;
		if (key === "tools" && !Array.isArray(input.tools)) {
			issues.push({ path: ["prompt", "tools"], keyword: "template_invalid", message: `"tools" must be a list of function tools` });
		}
		if (key === "response_format" && !isPlainObject(input.response_format)) {
			issues.push({ path: ["prompt", "response_format"], keyword: "template_invalid", message: `"response_format" must be an object such as {"type":"json_schema",…}` });
		}
	}
	if (Array.isArray(input.tools)) {
		input.tools.forEach((tool, index) => {
			const fn = isPlainObject(tool) && tool.type === "function" && isPlainObject(tool.function) ? tool.function : null;
			if (!fn || typeof fn.name !== "string" || !fn.name) {
				issues.push({ path: ["prompt", "tools", index], keyword: "template_invalid", message: `Tool ${index + 1} must be {"type":"function","function":{"name":…,"parameters":{…}}}` });
			}
		});
	}

	if (issues.length) return { ok: false, issues };
	return {
		ok: true,
		value: {
			messages,
			variables,
			...(input.tools !== undefined ? { tools: input.tools as unknown[] } : {}),
			...(input.tool_choice !== undefined ? { tool_choice: input.tool_choice } : {}),
			...(input.response_format !== undefined ? { response_format: input.response_format } : {}),
		},
	};
}

// ---------------------------------------------------------------------------
// Variable values

function isImageValue(value: unknown): boolean {
	return imageUrlOf(value) !== null;
}

/** Accepts a URL or data URL string, or the image part shapes the gateway accepts. */
function imageUrlOf(value: unknown): string | null {
	if (typeof value === "string") return /^(https?:\/\/|data:image\/)/i.test(value) ? value : null;
	if (!isPlainObject(value)) return null;
	if (value.type === "image_url") {
		const inner = value.image_url;
		if (typeof inner === "string") return imageUrlOf(inner);
		if (isPlainObject(inner) && typeof inner.url === "string") return imageUrlOf(inner.url);
	}
	if (value.type === "input_image" && typeof value.image_url === "string") return imageUrlOf(value.image_url);
	if (value.type === "image" && isPlainObject(value.source)) {
		const source = value.source;
		if (source.type === "url" && typeof source.url === "string") return imageUrlOf(source.url);
		if (source.type === "base64" && typeof source.media_type === "string" && typeof source.data === "string") {
			return `data:${source.media_type};base64,${source.data}`;
		}
	}
	return null;
}

function describe(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "a list";
	return typeof value === "object" ? "an object" : `a ${typeof value}`;
}

/** Returns a problem phrase ("must be …"), or null when the value fits the spec. */
function checkValue(spec: PromptVariableSpec, value: unknown): string | null {
	switch (spec.type) {
		case "string":
			if (typeof value !== "string") return `must be text, not ${describe(value)}`;
			if (spec.max_length && value.length > spec.max_length) return `must be at most ${spec.max_length} characters (got ${value.length})`;
			return null;
		case "number":
			return typeof value === "number" && Number.isFinite(value) ? null : `must be a number, not ${describe(value)}`;
		case "boolean":
			return typeof value === "boolean" ? null : `must be true or false, not ${describe(value)}`;
		case "enum":
			return typeof value === "string" && (spec.enum ?? []).includes(value)
				? null
				: `must be one of: ${(spec.enum ?? []).map((v) => JSON.stringify(v)).join(", ")}`;
		case "array":
			return Array.isArray(value) ? null : `must be a list, not ${describe(value)}`;
		case "object":
			return isPlainObject(value) ? null : `must be an object, not ${describe(value)}`;
		case "any":
			return null;
		case "image":
			return isImageValue(value) ? null : `must be an image: an https URL, a data:image/ URL, or an image part`;
	}
}

function approximateJsonBytes(value: unknown): number {
	try {
		return JSON.stringify(value)?.length ?? 0;
	} catch {
		return Number.POSITIVE_INFINITY;
	}
}

/**
 * Check request variables against the template: required values present, types
 * right, no unknown names. Fills defaults. Every problem is reported at once.
 */
export function resolvePromptVariables(
	template: CompiledPromptTemplate,
	input: unknown,
	options: { templateName?: string; path?: Array<string | number> } = {},
): PromptTemplateResult<Record<string, unknown>> {
	const basePath = options.path ?? ["prompt", "variables"];
	const label = options.templateName ? `Template "${options.templateName}"` : "This template";
	if (input !== undefined && input !== null && !isPlainObject(input)) {
		return { ok: false, issues: [{ path: basePath, keyword: "template_variables_invalid", message: `"variables" must be an object keyed by variable name` }] };
	}
	const values = (input ?? {}) as Record<string, unknown>;
	if (approximateJsonBytes(values) > PROMPT_TEMPLATE_LIMITS.maxVariablesBytes) {
		return { ok: false, issues: [{ path: basePath, keyword: "template_limit_exceeded", message: `"variables" is larger than ${PROMPT_TEMPLATE_LIMITS.maxVariablesBytes} bytes`, params: { limit: "maxVariablesBytes" } }] };
	}
	const issues: PromptTemplateIssue[] = [];
	const resolved: Record<string, unknown> = Object.create(null);
	for (const [name, spec] of Object.entries(template.variables)) {
		const provided = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : undefined;
		if (provided === undefined || provided === null) {
			if (spec.required) {
				issues.push({
					path: [...basePath, name],
					keyword: "template_variable_required",
					message: `${label} needs variable "${name}" (${spec.type})${spec.description ? `: ${spec.description}` : ""}`,
					params: { name, type: spec.type },
				});
			} else if (spec.default !== undefined) {
				resolved[name] = spec.default;
			}
			continue;
		}
		const problem = checkValue(spec, provided);
		if (problem) {
			issues.push({ path: [...basePath, name], keyword: "template_variable_type", message: `Variable "${name}" ${problem}`, params: { name, type: spec.type } });
			continue;
		}
		resolved[name] = provided;
	}
	const unknown = Object.keys(values).filter((name) => !Object.prototype.hasOwnProperty.call(template.variables, name));
	for (const name of unknown) {
		const known = Object.keys(template.variables);
		issues.push({
			path: [...basePath, name],
			keyword: "template_variable_unknown",
			message: `${label} has no variable "${name}"${known.length ? `. Its variables are: ${known.join(", ")}` : "; it takes no variables"}`,
			params: { name },
		});
	}
	return issues.length ? { ok: false, issues } : { ok: true, value: resolved };
}

// ---------------------------------------------------------------------------
// Render

/**
 * Render a compiled template with resolved variables (from resolvePromptVariables).
 * Adjacent text parts are merged, and messages whose content renders empty are
 * dropped so optional sections can remove a whole message.
 */
export function renderPromptTemplate(
	template: CompiledPromptTemplate,
	variables: Record<string, unknown>,
): PromptTemplateResult<RenderedPromptMessage[]> {
	const budget: RenderBudget = { iterations: 0, chars: 0 };
	const scopes = [variables];
	const renderString = (parsed: ParsedTemplateString) => {
		const out: string[] = [];
		renderNodes(parsed.nodes, scopes, budget, out);
		return out.join("");
	};
	const rendered: RenderedPromptMessage[] = [];
	try {
		for (const message of template.messages) {
			if (!Array.isArray(message.content)) {
				const text = renderString(message.content);
				if (text.trim()) rendered.push({ role: message.role, content: text });
				continue;
			}
			const parts: RenderedPromptPart[] = [];
			for (const part of message.content) {
				if (part.kind === "text") {
					const text = renderString(part.parsed);
					if (!text) continue;
					const last = parts[parts.length - 1];
					if (last?.type === "text") last.text += text;
					else parts.push({ type: "text", text });
				} else {
					const url = imageUrlOf(variables[part.name]);
					if (url) parts.push({ type: "image_url", image_url: { url } });
				}
			}
			const hasContent = parts.some((part) => part.type !== "text" || part.text.trim());
			if (hasContent) rendered.push({ role: message.role, content: parts });
		}
	} catch (error) {
		if (error instanceof RenderLimitError) {
			const description = error.limit === "maxLoopIterations"
				? `Rendering ran more than ${PROMPT_TEMPLATE_LIMITS.maxLoopIterations} section iterations; send shorter lists`
				: `Rendered text is longer than ${PROMPT_TEMPLATE_LIMITS.maxOutputChars} characters`;
			return { ok: false, issues: [{ path: ["prompt", "variables"], keyword: "template_limit_exceeded", message: description, params: { limit: error.limit } }] };
		}
		throw error;
	}
	return { ok: true, value: rendered };
}

