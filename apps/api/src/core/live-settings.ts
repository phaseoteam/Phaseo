import { z } from "zod";

// https://developers.openai.com/api/reference/resources/live
export const LIVE_VOICES = ["alloy", "ash", "ballad", "beacon", "bossa", "cedar", "cinder", "coral", "delta", "echo", "gleam", "marin", "meridian", "quartz", "ripple", "sage", "shimmer", "stone", "tempo", "verse", "vesper", "willow"] as const;
export const LIVE_MAX_OUTPUT_TOKENS = 4096;
export const LIVE_BACKEND_INSTRUCTIONS = "Answer the user's request accurately and concisely for a spoken conversation. Return verified facts and task status. Do not claim to have performed actions without a tool result.";

// Only expose the intersection supported by Live and both playground backends.
// No arbitrary tool definitions, model overrides, recording, or client delegation.
export const liveBackendSettingsSchema = z.object({
	instructions: z.string().trim().max(16000).default(LIVE_BACKEND_INSTRUCTIONS),
	max_output_tokens: z.number().int().min(16).max(32768).default(LIVE_MAX_OUTPUT_TOKENS),
	reasoning_effort: z.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
	reasoning_summary: z.enum(["auto", "concise", "detailed"]).optional(),
	verbosity: z.enum(["low", "medium", "high"]).optional(),
	service_tier: z.enum(["default", "flex", "priority"]).default("default"),
	web_search: z.boolean().default(false),
	tool_choice: z.enum(["auto", "none", "required"]).default("auto"),
	parallel_tool_calls: z.boolean().default(true),
}).strict().refine((settings) => settings.web_search || settings.tool_choice !== "required", {
	message: "Enable web search before requiring a tool call.", path: ["tool_choice"],
});
export type LiveBackendSettings = z.output<typeof liveBackendSettingsSchema>;
