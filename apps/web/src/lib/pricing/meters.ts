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
  "cached_write_text_tokens_5m",
  "cached_write_text_tokens_1h",
  "output_video_seconds",
  "bfl_credits",
  "total_tokens",
  "requests",
  "input_image",
  "input_video_seconds",
] as const

const PRICING_METER_LABELS: Partial<Record<(typeof CORE_PRICING_METER_VALUES)[number], string>> = {
  implicit_cached_input_text_tokens: "Implicit Cached Input Text Tokens",
  cached_read_text_tokens: "Cache Read Tokens",
  cached_write_text_tokens: "Cache Write Tokens",
  cached_write_text_tokens_5m: "Cache Write Tokens (5 Min TTL)",
  cached_write_text_tokens_1h: "Cache Write Tokens (1 Hour TTL)",
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
