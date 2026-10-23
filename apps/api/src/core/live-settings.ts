import { z } from "zod";

// https://developers.openai.com/api/reference/resources/live
export const LIVE_VOICES = ["alloy", "ash", "ballad", "beacon", "bossa", "cedar", "cinder", "coral", "delta", "echo", "gleam", "marin", "meridian", "quartz", "ripple", "sage", "shimmer", "stone", "tempo", "verse", "vesper", "willow"] as const;
export const LIVE_MAX_OUTPUT_TOKENS = 4096;
export const LIVE_BACKEND_INSTRUCTIONS = "Answer the user's request accurately and concisely for a spoken conversation. Return verified facts and task status. Do not claim to have performed actions without a tool result.";

export const LIVE_MAX_FUNCTION_TOOLS = 32;

// A client-executed function tool, passed to the delegated Responses backend.
// The client runs it and returns the result; the gateway never executes tools.
export const liveFunctionToolSchema = z.object({
	type: z.literal("function"),
	name: z.string().trim().regex(/^[a-zA-Z0-9_-]{1,64}$/),
	description: z.string().trim().max(1024).optional(),
	parameters: z.record(z.string(), z.unknown()).optional(),
	strict: z.boolean().optional(),
}).strict();
export type LiveFunctionTool = z.output<typeof liveFunctionToolSchema>;

// Only expose the intersection supported by Live and both backends: web
// search and client-executed function tools. No model overrides, recording,
// or gateway-executed tools.
export const liveBackendSettingsSchema = z.object({
	instructions: z.string().trim().max(16000).default(LIVE_BACKEND_INSTRUCTIONS),
	max_output_tokens: z.number().int().min(16).max(32768).default(LIVE_MAX_OUTPUT_TOKENS),
	reasoning_effort: z.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
	reasoning_summary: z.enum(["auto", "concise", "detailed"]).optional(),
	verbosity: z.enum(["low", "medium", "high"]).optional(),
	service_tier: z.enum(["default", "flex", "priority"]).default("default"),
	web_search: z.boolean().default(false),
	tools: z.array(liveFunctionToolSchema).max(LIVE_MAX_FUNCTION_TOOLS).default([]),
	tool_choice: z.enum(["auto", "none", "required"]).default("auto"),
	parallel_tool_calls: z.boolean().default(true),
}).strict().refine((settings) => settings.web_search || settings.tools.length > 0 || settings.tool_choice !== "required", {
	message: "Enable web search or add a function tool before requiring a tool call.", path: ["tool_choice"],
}).refine((settings) => new Set(settings.tools.map((tool) => tool.name)).size === settings.tools.length, {
	message: "Function tool names must be unique.", path: ["tools"],
}).refine((settings) => JSON.stringify(settings.tools).length <= 32_768, {
	message: "Function tool definitions are too large.", path: ["tools"],
});
export type LiveBackendSettings = z.output<typeof liveBackendSettingsSchema>;
