// Add/remove pricing meters in this list only.
const CORE_PRICING_METER_VALUES = [
  "input_text_tokens",
  "input_image_tokens",
  "input_video_tokens",
  "input_audio_tokens",
  "output_text_tokens",
  "cached_read_text_tokens",
  "output_image",
  "cached_read_image_tokens",
  "output_image_tokens",
  "cached_read_audio_tokens",
  "output_audio_tokens",
  "cached_write_text_tokens",
  "output_video_seconds",
  "total_tokens",
  "requests",
  "input_image",
  "input_video_seconds",
] as const

const toTitleCase = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")

export const PRICING_METER_VALUES = [...CORE_PRICING_METER_VALUES]

export const PRICING_METER_OPTIONS = PRICING_METER_VALUES.map((value) => ({
  value,
  label: toTitleCase(value),
}))

