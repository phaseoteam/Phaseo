// Add/remove pricing meters in this list only.
const CORE_PRICING_METER_VALUES = [
  "input_tokens",
  "input_characters",
  "input_pages",
  "input_text_tokens",
  "input_image_tokens",
  "input_audio_minutes",
  "image_pixels",
  "video_pixels",
  "input_video_tokens",
  "input_audio_tokens",
  "output_tokens",
  "output_text_tokens",
  "output_reasoning_tokens",
  "implicit_cached_input_text_tokens",
  "cached_read_text_tokens",
  "output_image",
  "output_video",
  "output_video_tokens",
  "cached_read_image_tokens",
  "output_image_tokens",
  "cached_read_audio_tokens",
  "output_audio_tokens",
  "cached_write_text_tokens",
  "output_video_seconds",
  "bfl_credits",
  "total_tokens",
  "requests",
  "server_tool_web_search_requests",
  "server_tool_web_search_extra_results",
  "server_tool_web_fetch_requests",
  "server_tool_advisor_requests",
  "server_tool_image_generation_requests",
  "server_tool_apply_patch_requests",
  "native_web_search_requests",
  "native_web_fetch_requests",
  "input_image",
  "input_video_seconds",
] as const

const PRICING_METER_LABELS: Partial<Record<(typeof CORE_PRICING_METER_VALUES)[number], string>> = {
  implicit_cached_input_text_tokens: "Implicit Cached Input Text Tokens",
  server_tool_web_search_requests: "Server Tool Web Search Requests",
  server_tool_web_search_extra_results: "Server Tool Web Search Extra Results",
  server_tool_web_fetch_requests: "Server Tool Web Fetch Requests",
  server_tool_advisor_requests: "Server Tool Advisor Requests",
  server_tool_image_generation_requests: "Server Tool Image Generation Requests",
  server_tool_apply_patch_requests: "Server Tool Apply Patch Requests",
  native_web_search_requests: "Native Web Search Requests",
  native_web_fetch_requests: "Native Web Fetch Requests",
}

const toTitleCase = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

export const PRICING_METER_VALUES = [...CORE_PRICING_METER_VALUES]

export const PRICING_METER_OPTIONS = PRICING_METER_VALUES.map((value) => ({
  value,
  label: PRICING_METER_LABELS[value] ?? toTitleCase(value),
}))
