export const MODEL_STATUS_OPTIONS = [
  "Rumoured",
  "Announced",
  "Withheld",
  "Available",
  "Deprecated",
  "Retired",
] as const

export type ModelStatusOption = (typeof MODEL_STATUS_OPTIONS)[number]

const LEGACY_RELEASED_STATUSES = new Set([
  "available",
  "active",
  "beta",
  "preview",
  "released",
])

export function normalizeModelStatus(value: string | null | undefined): ModelStatusOption {
  const normalized = (value ?? "").trim().toLowerCase()
  if (normalized === "rumoured") return "Rumoured"
  if (normalized === "announced") return "Announced"
  if (normalized === "withheld") return "Withheld"
  if (normalized === "deprecated") return "Deprecated"
  if (normalized === "retired") return "Retired"
  if (LEGACY_RELEASED_STATUSES.has(normalized)) return "Available"
  return "Available"
}

export const MODEL_MODALITY_OPTIONS = [
  "text",
  "image",
  "audio",
  "video",
  "embedding",
  "rerank",
  "moderation",
] as const

export type ModelModalityOption = (typeof MODEL_MODALITY_OPTIONS)[number]

export const MODEL_CAPABILITY_OPTIONS = [
  "text.generate",
  "text.embed",
  "text.rerank",
  "text.moderate",
  "image.generate",
  "image.edit",
  "audio.transcribe",
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
