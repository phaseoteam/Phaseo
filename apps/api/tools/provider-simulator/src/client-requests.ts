// Purpose: Client request matrix for the provider simulator.
// Why: Every documented parameter, content part, tool shape and agent history must be pushed through each provider.
// How: Reads our public OpenAPI spec for the documented top-level params, then combines curated values with
//      schema-derived ones. Every value carries a sentinel so the upstream body can be traced.

import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { REPO_ROOT } from "./catalogue";
import { createSchemaDocument, enumValuesOf, topLevelProperties, typeOf, type SchemaDocument, type Schema } from "./schema";

export type Surface = "chat" | "responses" | "messages";

export type ClientScenario = {
	id: string;
	surface: Surface;
	kind: "base" | "param" | "content" | "tools" | "cache" | "reasoning" | "agent" | "stream";
	/** Documented parameter this scenario exercises, if any. */
	param?: string;
	body: Record<string, any>;
	/** Set for agent conversations so consecutive steps can be compared for prefix stability. */
	conversation?: { id: string; step: number };
	note?: string;
};

export const SURFACE_ENDPOINT: Record<Surface, "chat.completions" | "responses" | "messages"> = {
	chat: "chat.completions",
	responses: "responses",
	messages: "messages",
};

export const SURFACE_PROTOCOL = {
	chat: "openai.chat.completions",
	responses: "openai.responses",
	messages: "anthropic.messages",
} as const;

const SPEC_SCHEMA: Record<Surface, string> = {
	chat: "ChatCompletionsRequest",
	responses: "ResponsesRequest",
	messages: "AnthropicMessagesRequest",
};

let specDoc: SchemaDocument | null = null;

export function loadPublicSpec(): SchemaDocument {
	if (specDoc) return specDoc;
	const file = path.join(REPO_ROOT, "apps/docs/openapi/v1/openapi.yaml");
	specDoc = createSchemaDocument(yaml.load(fs.readFileSync(file, "utf8")));
	return specDoc;
}

export function documentedParams(surface: Surface): Record<string, Schema> {
	const doc = loadPublicSpec();
	return topLevelProperties(doc, doc.root.components.schemas[SPEC_SCHEMA[surface]]);
}

// ---------------------------------------------------------------------------
// Shared building blocks. Every string that should reach the provider carries a SIM marker.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = "SIM-SYSTEM-PROMPT-0001 You are a careful coding agent. Follow the tools contract exactly.";
const USER_TEXT = "SIM-USER-TEXT-0001 What is the weather in Paris?";
const PNG_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PNG_BASE64 = PNG_DATA_URL.split(",")[1];
const PDF_BASE64 = "JVBERi0xLjQKJXNpbQo=";
const WAV_BASE64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

const WEATHER_SCHEMA = {
	type: "object",
	properties: {
		sim_arg_city: { type: "string", description: "SIM-ARG-DESC-city" },
		sim_arg_units: { type: "string", enum: ["c", "f"] },
		sim_arg_nested: {
			type: "object",
			properties: { sim_arg_depth: { type: "integer" } },
			required: ["sim_arg_depth"],
			additionalProperties: false,
		},
	},
	required: ["sim_arg_city", "sim_arg_units", "sim_arg_nested"],
	additionalProperties: false,
};
const SEARCH_SCHEMA = {
	type: "object",
	properties: { sim_arg_query: { type: "string" } },
	required: ["sim_arg_query"],
	additionalProperties: false,
};

const RESPONSE_SCHEMA = {
	type: "object",
	properties: { sim_field_answer: { type: "string" }, sim_field_score: { type: "number" } },
	required: ["sim_field_answer", "sim_field_score"],
	additionalProperties: false,
};

function chatTools(extra: Record<string, any> = {}) {
	return [
		{ type: "function", function: { name: "sim_tool_weather", description: "SIM-TOOL-DESC-weather", parameters: WEATHER_SCHEMA, strict: true, ...extra } },
		{ type: "function", function: { name: "sim_tool_search", description: "SIM-TOOL-DESC-search", parameters: SEARCH_SCHEMA } },
	];
}

function responsesTools(extra: Record<string, any> = {}) {
	return [
		{ type: "function", name: "sim_tool_weather", description: "SIM-TOOL-DESC-weather", parameters: WEATHER_SCHEMA, strict: true, ...extra },
		{ type: "function", name: "sim_tool_search", description: "SIM-TOOL-DESC-search", parameters: SEARCH_SCHEMA, strict: false },
	];
}

function messagesTools(extra: Record<string, any> = {}) {
	return [
		{ name: "sim_tool_weather", description: "SIM-TOOL-DESC-weather", input_schema: WEATHER_SCHEMA, ...extra },
		{ name: "sim_tool_search", description: "SIM-TOOL-DESC-search", input_schema: SEARCH_SCHEMA },
	];
}

const TOOL_ARGS = { sim_arg_city: "SIM-ARG-Paris", sim_arg_units: "c", sim_arg_nested: { sim_arg_depth: 2 } };
const TOOL_ARGS_JSON = JSON.stringify(TOOL_ARGS);
const SEARCH_ARGS_JSON = JSON.stringify({ sim_arg_query: "SIM-ARG-query-paris" });

function base(surface: Surface): Record<string, any> {
	switch (surface) {
		case "chat":
			return { messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: USER_TEXT }] };
		case "responses":
			return { instructions: SYSTEM_PROMPT, input: USER_TEXT };
		case "messages":
			return { max_tokens: 777, system: SYSTEM_PROMPT, messages: [{ role: "user", content: USER_TEXT }] };
	}
}

// ---------------------------------------------------------------------------
// Curated parameter values. Anything documented but not listed here gets a schema-derived value.
// ---------------------------------------------------------------------------

type Curated = Record<string, unknown | ((surface: Surface) => unknown)>;

const CURATED: Record<Surface, Curated> = {
	chat: {
		temperature: 0.37,
		top_p: 0.91,
		top_k: 41,
		min_p: 0.07,
		seed: 424242,
		max_tokens: 777,
		max_completion_tokens: 777,
		max_output_tokens: 777,
		frequency_penalty: 0.11,
		presence_penalty: 0.13,
		repetition_penalty: 1.07,
		logprobs: true,
		top_logprobs: 3,
		logit_bias: { "1729": 7 },
		stop: ["SIM-STOP-1", "SIM-STOP-2"],
		n: 1,
		user: "sim-user-4c1",
		user_id: "sim-user-id-4c2",
		safety_identifier: "sim-safety-9d2",
		prompt_cache_key: "sim-pck-7a3",
		prompt_cache_retention: "24h",
		metadata: { sim_meta_key: "sim-meta-value-55" },
		parallel_tool_calls: false,
		tools: chatTools(),
		tool_choice: "required",
		response_format: { type: "json_schema", json_schema: { name: "sim_schema_answer", schema: RESPONSE_SCHEMA, strict: true } },
		reasoning_effort: "high",
		reasoning: { effort: "high", max_tokens: 1337, summary: "detailed" },
		verbosity: "low",
		service_tier: "flex",
		modalities: ["text", "audio"],
		audio: { voice: "sim-voice-alloy", format: "wav" },
		prediction: { type: "content", content: "SIM-PREDICTION-CONTENT" },
		web_search_options: { search_context_size: "low", user_location: { type: "approximate", approximate: { city: "SIM-CITY-London" } } },
		stream_options: { include_usage: true },
		store: true,
		cache_control: { type: "ephemeral", ttl: "1h" },
		provider_options: {
			anthropic: { cache_control: { type: "ephemeral", ttl: "1h" } },
			openai: { prompt_cache_retention: "24h" },
			google: { cached_content: "cachedContents/sim-cache-1" },
			xai: { conversation_id: "sim-xai-conv-1" },
		},
		max_tool_calls: 9,
		image_config: { aspect_ratio: "16:9" },
	},
	responses: {
		temperature: 0.37,
		top_p: 0.91,
		top_k: 41,
		seed: 424242,
		max_output_tokens: 777,
		max_tool_calls: 9,
		top_logprobs: 3,
		user: "sim-user-4c1",
		safety_identifier: "sim-safety-9d2",
		prompt_cache_key: "sim-pck-7a3",
		prompt_cache_retention: "24h",
		metadata: { sim_meta_key: "sim-meta-value-55" },
		parallel_tool_calls: false,
		tools: responsesTools(),
		tool_choice: "required",
		text: { format: { type: "json_schema", name: "sim_schema_answer", schema: RESPONSE_SCHEMA, strict: true }, verbosity: "low" },
		reasoning: { effort: "high", summary: "detailed", max_tokens: 1337 },
		service_tier: "flex",
		store: true,
		include: ["reasoning.encrypted_content"],
		truncation: "auto",
		background: false,
		previous_response_id: "resp_sim_prev_0001",
		conversation: "conv_sim_0001",
		prompt: { id: "pmpt_sim_0001", version: "2", variables: { sim_var: "SIM-PROMPT-VAR" } },
		context_management: [{ type: "compaction", compact_threshold: 100000 }],
		cache_control: { type: "ephemeral", ttl: "1h" },
		provider_options: {
			anthropic: { cache_control: { type: "ephemeral", ttl: "1h" } },
			openai: { prompt_cache_retention: "24h" },
			google: { cached_content: "cachedContents/sim-cache-1" },
			xai: { conversation_id: "sim-xai-conv-1" },
		},
		stream_options: { include_obfuscation: false },
	},
	messages: {
		temperature: 0.37,
		top_p: 0.91,
		top_k: 41,
		stop_sequences: ["SIM-STOP-1", "SIM-STOP-2"],
		metadata: { user_id: "sim-user-meta-4c3" },
		tools: messagesTools(),
		tool_choice: { type: "any", disable_parallel_tool_use: true },
		thinking: { type: "enabled", budget_tokens: 2048 },
		service_tier: "auto",
		cache_control: { type: "ephemeral", ttl: "1h" },
		output_config: { effort: "high" },
		output_format: { type: "json_schema", schema: RESPONSE_SCHEMA },
		container: "container_sim_0001",
		mcp_servers: [{ type: "url", url: "https://sim.example/mcp", name: "sim_mcp" }],
		context_management: { edits: [{ type: "clear_tool_uses_20250919" }] },
		provider_options: {
			anthropic: { cache_control: { type: "ephemeral", ttl: "1h" } },
			google: { cached_content: "cachedContents/sim-cache-1" },
		},
	},
};

/** Structural fields every scenario already sets, or that are exercised by dedicated scenarios. */
const SKIP_PARAMS = new Set(["model", "messages", "input", "stream", "system", "instructions", "debug", "models", "provider", "route", "preset", "plugins", "transforms"]);

function schemaDerivedValue(doc: SchemaDocument, schema: Schema, name: string, depth = 0): unknown {
	const resolved = doc.resolve(schema) ?? {};
	const enums = enumValuesOf(doc, resolved);
	if (enums && enums.length) return enums.find((v) => v !== null) ?? enums[0];
	const types = typeOf(doc, resolved);
	if (types.includes("boolean")) return true;
	if (types.includes("integer")) return Math.max(Number(resolved.minimum ?? 1), Math.min(Number(resolved.maximum ?? 9), 9));
	if (types.includes("number")) return Math.min(Number(resolved.maximum ?? 0.5), 0.5);
	if (types.includes("string")) return `sim-${name.replace(/_/g, "-")}`;
	if (types.includes("array") && resolved.items && depth < 3) return [schemaDerivedValue(doc, resolved.items, name, depth + 1)];
	if ((types.includes("object") || resolved.properties) && depth < 3) {
		const out: Record<string, unknown> = {};
		for (const key of resolved.required ?? Object.keys(resolved.properties ?? {}).slice(0, 2)) {
			const child = resolved.properties?.[key];
			if (child) out[key] = schemaDerivedValue(doc, child, key, depth + 1);
		}
		return out;
	}
	const variants = resolved.oneOf ?? resolved.anyOf;
	if (Array.isArray(variants) && variants.length && depth < 3) {
		const nonNull = variants.find((v: Schema) => !typeOf(doc, v).includes("null")) ?? variants[0];
		return schemaDerivedValue(doc, nonNull, name, depth + 1);
	}
	return `sim-${name.replace(/_/g, "-")}`;
}

function paramScenarios(surface: Surface): { scenarios: ClientScenario[]; documented: string[]; derived: string[] } {
	const doc = loadPublicSpec();
	const props = documentedParams(surface);
	const curated = CURATED[surface];
	const scenarios: ClientScenario[] = [];
	const derived: string[] = [];
	const names = Array.from(new Set([...Object.keys(props), ...Object.keys(curated)])).filter((name) => !SKIP_PARAMS.has(name));
	for (const name of names) {
		let value: unknown;
		if (name in curated) {
			const entry = curated[name];
			value = typeof entry === "function" ? (entry as (s: Surface) => unknown)(surface) : entry;
		} else {
			value = schemaDerivedValue(doc, props[name], name);
			derived.push(name);
		}
		const body = { ...base(surface), [name]: value };
		if (name === "tool_choice" || name === "parallel_tool_calls" || name === "max_tool_calls") {
			body.tools = surface === "chat" ? chatTools() : surface === "responses" ? responsesTools() : messagesTools();
		}
		if (name === "top_logprobs" && surface === "chat") body.logprobs = true;
		if (name === "audio") body.modalities = ["text", "audio"];
		if (name === "thinking" && surface === "messages") body.max_tokens = 4096;
		scenarios.push({ id: `${surface}.param.${name}`, surface, kind: "param", param: name, body, note: name in props ? undefined : "not in the public OpenAPI spec" });

		// Small enums get one variant per value: tool_choice modes, efforts, tiers.
		const enums = props[name] ? enumValuesOf(doc, props[name]) : null;
		if (enums && enums.length > 1 && enums.length <= 8 && !(name in curated && typeof curated[name] === "object")) {
			for (const option of enums) {
				if (option === null || option === value) continue;
				const variant = { ...body, [name]: option };
				scenarios.push({ id: `${surface}.param.${name}=${String(option)}`, surface, kind: "param", param: name, body: variant });
			}
		}
	}
	return { scenarios, documented: Object.keys(props).filter((name) => !SKIP_PARAMS.has(name)), derived };
}

// ---------------------------------------------------------------------------
// Curated content, tool, cache, reasoning and agent scenarios.
// ---------------------------------------------------------------------------

function chatScenarios(): ClientScenario[] {
	const s: ClientScenario[] = [];
	const add = (id: string, kind: ClientScenario["kind"], body: Record<string, any>, note?: string, param?: string) =>
		s.push({ id: `chat.${id}`, surface: "chat", kind, body, note, param });
	const chatParts: Record<string, any> = {
		text: { type: "text", text: "SIM-PART-TEXT-0001" },
		image_url: { type: "image_url", image_url: { url: "https://sim.example/img-0001.png", detail: "high" } },
		image_data_url: { type: "image_url", image_url: { url: PNG_DATA_URL, detail: "low" } },
		input_audio: { type: "input_audio", input_audio: { data: WAV_BASE64, format: "wav" } },
		file_data: { type: "file", file: { filename: "sim-doc-0001.pdf", file_data: `data:application/pdf;base64,${PDF_BASE64}` } },
		file_id: { type: "file", file: { file_id: "file-sim-0001" } },
	};
	for (const [name, part] of Object.entries(chatParts)) {
		add(`content.part.${name}`, "content", { messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: [{ type: "text", text: USER_TEXT }, part] }] });
	}
	add("content.developer-role", "content", { messages: [{ role: "developer", content: "SIM-DEVELOPER-0001 Prefer metric units." }, { role: "user", content: USER_TEXT }] });
	add("content.system-parts", "content", { messages: [{ role: "system", content: [{ type: "text", text: SYSTEM_PROMPT }] }, { role: "user", name: "sim-user-name", content: USER_TEXT }] });
	add("tools.probe", "tools", { ...base("chat"), tools: chatTools(), tool_choice: "auto" }, "Request used for every response-direction variant.");
	add("content.second-system", "content", {
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: USER_TEXT },
			{ role: "assistant", content: "SIM-ASSISTANT-0001" },
			{ role: "system", content: "SIM-SYSTEM-LATE-0002 Mid-conversation instruction." },
			{ role: "user", content: "SIM-USER-TEXT-0002" },
		],
	}, "A later system message and a developer message must not replace the first.");
	add("content.assistant-null-content", "content", {
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: USER_TEXT },
			{ role: "assistant", content: null, tool_calls: [{ id: "call_SIM_0001", type: "function", function: { name: "sim_tool_weather", arguments: TOOL_ARGS_JSON } }] },
			{ role: "tool", tool_call_id: "call_SIM_0001", content: "SIM-TOOL-RESULT-0001 18C and clear" },
		],
		tools: chatTools(),
	}, "OpenAI SDKs send content: null on assistant tool-call messages.");
	add("tools.tool_choice.function", "tools", { ...base("chat"), tools: chatTools(), tool_choice: { type: "function", function: { name: "sim_tool_weather" } } }, undefined, "tool_choice");
	add("tools.tool_choice.none", "tools", { ...base("chat"), tools: chatTools(), tool_choice: "none" }, undefined, "tool_choice");
	add("tools.tool_choice.auto", "tools", { ...base("chat"), tools: chatTools(), tool_choice: "auto" }, undefined, "tool_choice");
	add("tools.custom", "tools", { ...base("chat"), tools: [{ type: "custom", custom: { name: "sim_tool_custom", description: "SIM-TOOL-DESC-custom" } }, ...chatTools()] });
	add("tools.part-cache-control", "cache", {
		messages: [
			{ role: "system", content: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }] },
			{ role: "user", content: [{ type: "text", text: USER_TEXT, cache_control: { type: "ephemeral" } }] },
		],
		tools: chatTools({ cache_control: { type: "ephemeral" } }),
	}, "Per-part and per-tool cache_control (documented in guides/prompt-caching.mdx).");
	add("cache.prompt_cache_breakpoint", "cache", {
		messages: [
			{ role: "system", content: [{ type: "text", text: SYSTEM_PROMPT, prompt_cache_breakpoint: { ttl: "30m" } }] },
			{ role: "user", content: USER_TEXT },
		],
		prompt_cache_key: "sim-pck-7a3",
	});
	add("cache.prompt_cache_breakpoint-user", "cache", {
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: [{ type: "text", text: USER_TEXT, prompt_cache_breakpoint: { ttl: "30m" } }] },
		],
	}, "Breakpoint on a user part (system parts are flattened to a string for some providers).");
	add("cache.anthropic-agent-scope", "cache", { ...base("chat"), provider_options: { anthropic: { cache_control: { type: "ephemeral", scope: "agent" } } }, prompt_cache_key: "sim-pck-7a3" });
	add("reasoning.effort-none", "reasoning", { ...base("chat"), reasoning: { effort: "none" } });
	add("reasoning.effort-minimal", "reasoning", { ...base("chat"), reasoning_effort: "minimal" });
	add("reasoning.enabled-only", "reasoning", { ...base("chat"), reasoning: { enabled: true } });
	add("reasoning.exclude", "reasoning", { ...base("chat"), reasoning: { effort: "low", exclude: true } });
	add("format.json_object", "param", { ...base("chat"), response_format: { type: "json_object" } }, undefined, "response_format");
	add("stream.include_usage", "stream", { ...base("chat"), stream: true, stream_options: { include_usage: true } });
	return s;
}

function responsesScenarios(): ClientScenario[] {
	const s: ClientScenario[] = [];
	const add = (id: string, kind: ClientScenario["kind"], body: Record<string, any>, note?: string, param?: string) =>
		s.push({ id: `responses.${id}`, surface: "responses", kind, body, note, param });
	const responsesParts: Record<string, any> = {
		input_text: { type: "input_text", text: "SIM-PART-TEXT-0001" },
		input_image_url: { type: "input_image", image_url: "https://sim.example/img-0001.png", detail: "high" },
		input_image_data_url: { type: "input_image", image_url: PNG_DATA_URL, detail: "low" },
		input_image_file_id: { type: "input_image", file_id: "file-sim-img-0001" },
		input_file_data: { type: "input_file", filename: "sim-doc-0001.pdf", file_data: `data:application/pdf;base64,${PDF_BASE64}` },
		input_file_url: { type: "input_file", file_url: "https://sim.example/doc-0001.pdf" },
		input_file_id: { type: "input_file", file_id: "file-sim-0001" },
		input_audio: { type: "input_audio", input_audio: { data: WAV_BASE64, format: "wav" } },
	};
	for (const [name, part] of Object.entries(responsesParts)) {
		add(`content.part.${name}`, "content", { instructions: SYSTEM_PROMPT, input: [{ type: "message", role: "user", content: [{ type: "input_text", text: USER_TEXT }, part] }] });
	}
	add("content.developer-role", "content", { input: [{ type: "message", role: "developer", content: "SIM-DEVELOPER-0001 Prefer metric units." }, { type: "message", role: "user", content: USER_TEXT }] });
	add("tools.probe", "tools", { ...base("responses"), tools: responsesTools(), tool_choice: "auto" }, "Request used for every response-direction variant.");
	add("tools.tool_choice.function", "tools", { ...base("responses"), tools: responsesTools(), tool_choice: { type: "function", name: "sim_tool_weather" } }, undefined, "tool_choice");
	add("tools.tool_choice.allowed_tools", "tools", { ...base("responses"), tools: responsesTools(), tool_choice: { type: "allowed_tools", mode: "auto", tools: [{ type: "function", name: "sim_tool_search" }] } }, undefined, "tool_choice");
	add("tools.tool_choice.auto", "tools", { ...base("responses"), tools: responsesTools(), tool_choice: "auto" }, undefined, "tool_choice");
	add("tools.hosted", "tools", { ...base("responses"), tools: [...responsesTools(), { type: "web_search" }, { type: "file_search", vector_store_ids: ["vs_sim_0001"] }, { type: "code_interpreter", container: { type: "auto" } }] });
	add("tools.mcp", "tools", { ...base("responses"), tools: [{ type: "mcp", server_label: "sim_mcp", server_url: "https://sim.example/mcp", require_approval: "never" }] });
	add("tools.custom", "tools", { ...base("responses"), tools: [{ type: "custom", name: "sim_tool_custom", description: "SIM-TOOL-DESC-custom" }, ...responsesTools()] });
	add("cache.part-cache-control", "cache", {
		instructions: SYSTEM_PROMPT,
		input: [{ type: "message", role: "user", content: [{ type: "input_text", text: USER_TEXT, cache_control: { type: "ephemeral", ttl: "1h" } }] }],
		tools: responsesTools({ cache_control: { type: "ephemeral" } }),
	});
	add("cache.anthropic-agent-scope", "cache", { ...base("responses"), provider_options: { anthropic: { cache_control: { type: "ephemeral", scope: "agent" } } }, prompt_cache_key: "sim-pck-7a3" });
	add("reasoning.effort-none", "reasoning", { ...base("responses"), reasoning: { effort: "none" } });
	add("reasoning.effort-minimal", "reasoning", { ...base("responses"), reasoning: { effort: "minimal" } });
	add("format.json_object", "param", { ...base("responses"), text: { format: { type: "json_object" } } }, undefined, "text");
	add("stream.flag", "stream", { ...base("responses"), stream: true });
	return s;
}

function messagesScenarios(): ClientScenario[] {
	const s: ClientScenario[] = [];
	const add = (id: string, kind: ClientScenario["kind"], body: Record<string, any>, note?: string, param?: string) =>
		s.push({ id: `messages.${id}`, surface: "messages", kind, body, note, param });
	const messagesParts: Record<string, any> = {
		image_base64: { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_BASE64 } },
		image_url: { type: "image", source: { type: "url", url: "https://sim.example/img-0001.png" } },
		document_pdf: { type: "document", title: "SIM-DOC-TITLE-0001", context: "SIM-DOC-CONTEXT-0001", citations: { enabled: true }, source: { type: "base64", media_type: "application/pdf", data: PDF_BASE64 } },
		document_text: { type: "document", source: { type: "text", media_type: "text/plain", data: "SIM-DOC-TEXT-0001" } },
		document_url: { type: "document", source: { type: "url", url: "https://sim.example/doc-0001.pdf" } },
		search_result: { type: "search_result", source: "https://sim.example/result", title: "SIM-SEARCH-TITLE", content: [{ type: "text", text: "SIM-SEARCH-CONTENT" }] },
	};
	for (const [name, part] of Object.entries(messagesParts)) {
		add(`content.part.${name}`, "content", { max_tokens: 777, system: [{ type: "text", text: SYSTEM_PROMPT }], messages: [{ role: "user", content: [{ type: "text", text: USER_TEXT }, part] }] });
	}
	add("tools.probe", "tools", { ...base("messages"), tools: messagesTools(), tool_choice: { type: "auto" } }, "Request used for every response-direction variant.");
	add("tools.tool_choice.tool", "tools", { ...base("messages"), tools: messagesTools(), tool_choice: { type: "tool", name: "sim_tool_weather" } }, undefined, "tool_choice");
	add("tools.tool_choice.none", "tools", { ...base("messages"), tools: messagesTools(), tool_choice: { type: "none" } }, undefined, "tool_choice");
	add("tools.tool_choice.auto", "tools", { ...base("messages"), tools: messagesTools(), tool_choice: { type: "auto" } }, undefined, "tool_choice");
	add("tools.server", "tools", { ...base("messages"), tools: [...messagesTools(), { type: "web_search_20250305", name: "web_search", max_uses: 2 }] });
	add("cache.blocks", "cache", {
		max_tokens: 777,
		system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } }],
		tools: messagesTools({ cache_control: { type: "ephemeral", ttl: "1h" } }),
		messages: [{ role: "user", content: [{ type: "text", text: USER_TEXT, cache_control: { type: "ephemeral" } }] }],
	});
	add("cache.anthropic-agent-scope", "cache", { ...base("messages"), provider_options: { anthropic: { cache_control: { type: "ephemeral", scope: "agent" } } } });
	add("reasoning.adaptive", "reasoning", { ...base("messages"), max_tokens: 4096, thinking: { type: "adaptive" } });
	add("reasoning.disabled", "reasoning", { ...base("messages"), thinking: { type: "disabled" } });
	add("stream.flag", "stream", { ...base("messages"), stream: true });
	return s;
}

/**
 * A three-step agent turn: system prompt, tools, parallel tool calls, tool results (text and image),
 * reasoning carried between steps. Each step extends the previous one, so the cacheable prefix
 * must be byte-identical between consecutive upstream bodies.
 */
export function agentScenarios(): ClientScenario[] {
	const out: ClientScenario[] = [];

	// Chat Completions.
	const chatHistory: any[] = [
		{ role: "system", content: SYSTEM_PROMPT },
		{ role: "user", content: USER_TEXT },
	];
	const chatStep2 = [
		...chatHistory,
		{
			role: "assistant",
			reasoning_content: "SIM-REASONING-CONTENT-0001",
			reasoning_details: [{ type: "reasoning.encrypted", data: "SIM-ENCRYPTED-REASONING-0001", format: "anthropic-claude-v1", index: 0 }],
			tool_calls: [
				{ id: "call_SIM_0001", type: "function", function: { name: "sim_tool_weather", arguments: TOOL_ARGS_JSON } },
				{ id: "call_SIM_0002", type: "function", function: { name: "sim_tool_search", arguments: SEARCH_ARGS_JSON } },
			],
		},
		{ role: "tool", tool_call_id: "call_SIM_0001", content: "SIM-TOOL-RESULT-0001 18C and clear" },
		{ role: "tool", tool_call_id: "call_SIM_0002", content: [{ type: "text", text: "SIM-TOOL-RESULT-0002 search hit" }] },
	];
	const chatStep3 = [
		...chatStep2,
		{ role: "assistant", content: "SIM-ASSISTANT-0003 It is 18C." },
		{ role: "user", content: "SIM-USER-TEXT-0003 And tomorrow?" },
	];
	[chatHistory, chatStep2, chatStep3].forEach((messages, index) =>
		out.push({ id: `chat.agent.step${index + 1}`, surface: "chat", kind: "agent", conversation: { id: "chat-agent", step: index + 1 }, body: { messages, tools: chatTools(), tool_choice: "auto", prompt_cache_key: "sim-pck-agent-01" } }),
	);

	// Responses.
	const respStep1: any[] = [{ type: "message", role: "user", content: [{ type: "input_text", text: USER_TEXT }] }];
	const respStep2: any[] = [
		...respStep1,
		{ type: "reasoning", id: "rs_SIM_0001", summary: [{ type: "summary_text", text: "SIM-REASONING-SUMMARY-0001" }], encrypted_content: "SIM-ENCRYPTED-REASONING-0001" },
		{ type: "function_call", id: "fc_SIM_0001", call_id: "call_SIM_0001", name: "sim_tool_weather", arguments: TOOL_ARGS_JSON },
		{ type: "function_call", id: "fc_SIM_0002", call_id: "call_SIM_0002", name: "sim_tool_search", arguments: SEARCH_ARGS_JSON },
		{ type: "function_call_output", call_id: "call_SIM_0001", output: "SIM-TOOL-RESULT-0001 18C and clear" },
		{ type: "function_call_output", call_id: "call_SIM_0002", output: [{ type: "input_text", text: "SIM-TOOL-RESULT-0002 search hit" }, { type: "input_image", image_url: PNG_DATA_URL }] },
	];
	const respStep3: any[] = [
		...respStep2,
		{ type: "message", role: "assistant", id: "msg_SIM_0003", content: [{ type: "output_text", text: "SIM-ASSISTANT-0003 It is 18C.", annotations: [] }] },
		{ type: "message", role: "user", content: [{ type: "input_text", text: "SIM-USER-TEXT-0003 And tomorrow?" }] },
	];
	[respStep1, respStep2, respStep3].forEach((input, index) =>
		out.push({ id: `responses.agent.step${index + 1}`, surface: "responses", kind: "agent", conversation: { id: "responses-agent", step: index + 1 }, body: { instructions: SYSTEM_PROMPT, input, tools: responsesTools(), tool_choice: "auto", prompt_cache_key: "sim-pck-agent-01", reasoning: { effort: "medium" } } }),
	);

	// Anthropic Messages.
	const msgStep1: any[] = [{ role: "user", content: USER_TEXT }];
	const msgStep2: any[] = [
		...msgStep1,
		{ role: "assistant", content: [
			{ type: "thinking", thinking: "SIM-THINKING-0001", signature: "SIM-SIGNATURE-0001" },
			{ type: "redacted_thinking", data: "SIM-REDACTED-THINKING-0001" },
			{ type: "text", text: "SIM-ASSISTANT-PREAMBLE-0002" },
			{ type: "tool_use", id: "toolu_SIM_0001", name: "sim_tool_weather", input: TOOL_ARGS },
			{ type: "tool_use", id: "toolu_SIM_0002", name: "sim_tool_search", input: { sim_arg_query: "SIM-ARG-query-paris" } },
		] },
		{ role: "user", content: [
			{ type: "tool_result", tool_use_id: "toolu_SIM_0001", content: "SIM-TOOL-RESULT-0001 18C and clear" },
			{ type: "tool_result", tool_use_id: "toolu_SIM_0002", is_error: true, content: [{ type: "text", text: "SIM-TOOL-RESULT-0002 search failed" }, { type: "image", source: { type: "base64", media_type: "image/png", data: PNG_BASE64 } }] },
		] },
	];
	const msgStep3: any[] = [
		...msgStep2,
		{ role: "assistant", content: [{ type: "text", text: "SIM-ASSISTANT-0003 It is 18C." }] },
		{ role: "user", content: "SIM-USER-TEXT-0003 And tomorrow?" },
	];
	[msgStep1, msgStep2, msgStep3].forEach((messages, index) =>
		out.push({ id: `messages.agent.step${index + 1}`, surface: "messages", kind: "agent", conversation: { id: "messages-agent", step: index + 1 }, body: { max_tokens: 4096, system: SYSTEM_PROMPT, messages, tools: messagesTools(), tool_choice: { type: "auto" }, thinking: { type: "enabled", budget_tokens: 2048 } } }),
	);
	return out;
}

export type ClientMatrix = {
	scenarios: ClientScenario[];
	coverage: Record<Surface, { documented: string[]; schemaDerived: string[] }>;
};

export function buildClientMatrix(): ClientMatrix {
	const scenarios: ClientScenario[] = [];
	const coverage = {} as ClientMatrix["coverage"];
	for (const surface of ["chat", "responses", "messages"] as Surface[]) {
		scenarios.push({ id: `${surface}.base`, surface, kind: "base", body: base(surface) });
		const params = paramScenarios(surface);
		scenarios.push(...params.scenarios);
		coverage[surface] = { documented: params.documented, schemaDerived: params.derived };
	}
	scenarios.push(...chatScenarios(), ...responsesScenarios(), ...messagesScenarios(), ...agentScenarios());
	return { scenarios, coverage };
}
