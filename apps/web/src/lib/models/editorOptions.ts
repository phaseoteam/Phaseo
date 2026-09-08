export const MODEL_STATUS_OPTIONS = [
    "Rumoured",
    "Announced",
	"Preview",
    "Limited Access",
    "Withheld",
    "Released",
    "Deprecated",
    "Retired",
] as const

export type ModelStatusOption = (typeof MODEL_STATUS_OPTIONS)[number]

const LEGACY_RELEASED_STATUSES = new Set([
    "available",
    "active",
    "beta",
    "released",
])

export function normalizeModelStatus(value: string | null | undefined): ModelStatusOption {
    const normalized = (value ?? "").trim().toLowerCase()
    if (normalized === "rumoured") return "Rumoured"
    if (normalized === "announced") return "Announced"
	if (normalized === "preview") return "Preview"
    if (
        normalized === "limited access" ||
        normalized === "limited_access" ||
        normalized === "limited-access" ||
        normalized === "private preview" ||
        normalized === "private_preview" ||
        normalized === "restricted"
    ) return "Limited Access"
    if (normalized === "withheld") return "Withheld"
    if (normalized === "deprecated") return "Deprecated"
    if (normalized === "retired") return "Retired"
    if (LEGACY_RELEASED_STATUSES.has(normalized)) return "Released"
    return "Released"
}

export const MODEL_MODALITY_OPTIONS = [
  "text",
  "image",
  "audio",
  "audio_stt",
  "audio_tts",
  "audio_music",
  "video",
  "embedding",
  "rerank",
  "moderation",
] as const

export type ModelModalityOption = (typeof MODEL_MODALITY_OPTIONS)[number]

export const QUANTIZATION_OPTIONS = [
  "fp32", "fp16", "bf16", "fp8", "fp4", "int8", "int4", "nvfp4", "mxfp4",
  "awq", "gptq", "Q2_K", "Q4_0", "Q4_K_M", "Q6_K", "Q8_0",
  "FP16/FP8", "FP8/NVFP4", "INT8/BINARY",
] as const

export const MODEL_CAPABILITY_OPTIONS = [
  "text.generate",
  "text.embed",
  "text.rerank",
  "text.moderate",
  "image.generate",
  "image.edit",
  "audio.transcribe",
  "audio.transcription",
  "audio.translations",
  "audio.realtime",
  "realtime",
  "ocr",
  "video.edit",
  "video.generate",
] as const

export const CAPABILITY_STATUS_OPTIONS = [
  "active",
  "deranked_lvl1",
  "deranked_lvl2",
  "deranked_lvl3",
  "disabled",
] as const

export type CapabilityStatusOption = (typeof CAPABILITY_STATUS_OPTIONS)[number]

export function normalizeCapabilityStatus(
  value: string | null | undefined
): CapabilityStatusOption {
  const normalized = (value ?? "").trim().toLowerCase()

  if (normalized === "disabled") return "disabled"
  if (normalized === "deranked_lvl1" || normalized === "deranked_lvl_1")
    return "deranked_lvl1"
  if (normalized === "deranked_lvl2" || normalized === "deranked_lvl_2")
    return "deranked_lvl2"
  if (normalized === "deranked_lvl3" || normalized === "deranked_lvl_3")
    return "deranked_lvl3"
  if (normalized === "deranked") return "deranked_lvl1"
  return "active"
}

export function editorOptionLabel(value: string): string {
  const labels: Record<string, string> = {
    "text.generate": "Text generation", "text.embed": "Text embeddings", "text.rerank": "Text reranking", "text.moderate": "Text moderation",
    "image.generate": "Image generation", "image.edit": "Image editing", "audio.transcribe": "Audio transcription", "audio.transcription": "Audio transcription (legacy)",
    "audio.translations": "Audio translation", "audio.realtime": "Realtime audio", realtime: "Realtime", ocr: "Optical character recognition",
    "video.edit": "Video editing", "video.generate": "Video generation", deranked_lvl1: "Deprioritized · Level 1", deranked_lvl2: "Deprioritized · Level 2", deranked_lvl3: "Deprioritized · Level 3",
  }
  return labels[value] ?? value.replace(/[_.-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
}
