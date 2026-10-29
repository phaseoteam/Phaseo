import { formatCalendarDate, formatRelativeUnit } from "@/lib/format";
import { ALargeSmall, BadgeAlert, Braces, Captions, Headphones, ImageIcon, Music4, Scale, Speech, Video, type LucideIcon } from "lucide-react-native";
import type { ModelDetail, ModelTimelineEvent } from "@/lib/api/models";

/** Normalised modality keys, as the website's About section parses `input_types` (ModelOverviewSections parseTypes). */
export function parseTypes(types: string[] | string | null | undefined): string[] {
  const normalise = (value: string) => {
    const key = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (key === "embedding") return "embeddings";
    if (key === "moderation") return "moderations";
    if (key.includes("music")) return "audio_music";
    if (key.includes("transcrib") || key.includes("speech_to_text") || key.includes("stt")) return "audio_stt";
    if (key.includes("text_to_speech") || key.includes("audio_speech") || key.includes("speech_synth") || key.includes("tts")) return "audio_tts";
    if (key.includes("decision")) return "decisions";
    return key;
  };
  const list = Array.isArray(types) ? types : typeof types === "string" ? types.split(",") : [];
  return [...new Set(list.map((type) => normalise(String(type ?? ""))).filter(Boolean))];
}

export const KNOWN_MODALITIES: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "text", label: "Text", icon: ALargeSmall },
  { key: "image", label: "Image", icon: ImageIcon },
  { key: "video", label: "Video", icon: Video },
  { key: "audio", label: "Audio", icon: Headphones },
  { key: "audio_tts", label: "Speech", icon: Speech },
  { key: "audio_stt", label: "Transcription", icon: Captions },
  { key: "audio_music", label: "Music", icon: Music4 },
  { key: "embeddings", label: "Embeddings", icon: Braces },
  { key: "moderations", label: "Moderation", icon: BadgeAlert },
  { key: "structured", label: "Structured state", icon: Braces },
  { key: "decisions", label: "Decisions", icon: Scale },
];

const EXTRA_LABELS: Record<string, string> = {
  file: "File", code: "Code", vision: "Vision", speech: "Speech", multimodal: "Multimodal", embedding: "Embedding", rerank: "Reranking", moderation: "Moderation",
};

/** Tags for a modality list: known ones in the website's order with icons, then any others by name. */
export function modalityTags(types: string[]) {
  const set = new Set(types);
  const known = KNOWN_MODALITIES.filter((modality) => set.has(modality.key)).map((modality) => ({ key: modality.key, label: modality.label, icon: modality.icon as LucideIcon | null }));
  const extra = types.filter((type) => !KNOWN_MODALITIES.some((modality) => modality.key === type)).map((type) => ({ key: type, label: EXTRA_LABELS[type] ?? type, icon: null }));
  return [...known, ...extra];
}

type Tone = { bg: string; fg: string };

/** The website's modality tag colours (lib/models/modalityStyles.ts), light and dark. */
const TONES: Record<string, { light: Tone; dark: Tone }> = {
  text: { light: { bg: "#DBEAFE", fg: "#1E40AF" }, dark: { bg: "#0F1E3A", fg: "#93C5FD" } },
  image: { light: { bg: "#FCE0ED", fg: "#9D174D" }, dark: { bg: "#311320", fg: "#F9A8D4" } },
  video: { light: { bg: "#EDE1FE", fg: "#5B21B6" }, dark: { bg: "#211534", fg: "#C4B5FD" } },
  audio: { light: { bg: "#CFF3FA", fg: "#155E75" }, dark: { bg: "#0B2730", fg: "#8CE6F7" } },
  realtime: { light: { bg: "#FFE2CC", fg: "#9A3412" }, dark: { bg: "#351B0C", fg: "#FDBA74" } },
  audio_tts: { light: { bg: "#DCF2E2", fg: "#166534" }, dark: { bg: "#11261A", fg: "#98EBB7" } },
  audio_stt: { light: { bg: "#FEF0C3", fg: "#854D0E" }, dark: { bg: "#31240D", fg: "#F8C96B" } },
  audio_music: { light: { bg: "#F5DDF9", fg: "#86198F" }, dark: { bg: "#351139", fg: "#F0ABFC" } },
  file: { light: { bg: "#F7FDEB", fg: "#6A8B19" }, dark: { bg: "#202A10", fg: "#D8F39C" } },
  moderations: { light: { bg: "#FCE0DE", fg: "#991B1B" }, dark: { bg: "#311515", fg: "#FFAAAA" } },
  decisions: { light: { bg: "#EDE8E2", fg: "#44403C" }, dark: { bg: "#292524", fg: "#D6D3D1" } },
  rerank: { light: { bg: "#CCF1E9", fg: "#115E59" }, dark: { bg: "#0E2826", fg: "#8FE6D9" } },
  embeddings: { light: { bg: "#E2EAF3", fg: "#334155" }, dark: { bg: "#202936", fg: "#CBD5E1" } },
  documents: { light: { bg: "#DEDDFC", fg: "#3730A3" }, dark: { bg: "#1A1840", fg: "#A5A9FC" } },
  translation: { light: { bg: "#F1E4D3", fg: "#7C4A1E" }, dark: { bg: "#2A1C10", fg: "#E2B98C" } },
};
const DEFAULT_TONE = { light: { bg: "#F6F8FB", fg: "#516070" }, dark: { bg: "#1F2937", fg: "#E5E7EB" } };

function toneKey(value: string) {
  const key = value.trim().toLowerCase().replace(/[._/-]+/g, " ");
  if (key.includes("realtime") || key.includes("real time")) return "realtime";
  if (/\bocr\b/.test(key) || /\bpars(e|ing)\b/.test(key)) return "documents";
  if (key.includes("translat")) return "translation";
  if (key.includes("embed")) return "embeddings";
  if (key.includes("rerank") || key.includes("re rank")) return "rerank";
  if (key.includes("moderat")) return "moderations";
  if (key.includes("decision")) return "decisions";
  if (key.includes("image")) return "image";
  if (key.includes("video")) return "video";
  if (key.includes("music")) return "audio_music";
  if (key.includes("transcri") || key.includes("speech to text") || key.includes("stt")) return "audio_stt";
  if (key.includes("text to speech") || key.includes("audio speech") || key.includes("speech synth") || key.includes("tts")) return "audio_tts";
  if (key.includes("audio")) return "audio";
  if (key.includes("file")) return "file";
  if (key.includes("text")) return "text";
  return key.replace(/\s+/g, "_");
}

export function modalityTone(modality: string, theme: "light" | "dark"): Tone {
  return (TONES[toneKey(modality)] ?? DEFAULT_TONE)[theme];
}

/** A model detail by name ("parameter_count"), as text. */
export function detailValue(model: Pick<ModelDetail, "model_details"> | null | undefined, name: string) {
  const detail = model?.model_details?.find((item) => item.detail_name === name);
  return detail?.detail_value == null || detail.detail_value === "" ? null : String(detail.detail_value);
}

/** "1.8 trillion", "70 billion": the website writes counts in long compact form. */
export function formatLongCount(value: string | number | null | undefined) {
  if (value == null || value === "" || value === 0) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const units: [number, string][] = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
  for (const [size, word] of units) {
    if (number >= size) return `${Number((number / size).toFixed(2))} ${word}`;
  }
  return String(number);
}

export function licenceLabel(raw: string | null) {
  const value = raw?.trim();
  if (!value) return null;
  return value.toLowerCase() === "proprietary" || value.toLowerCase() === "proprietary license" ? "Proprietary license" : value;
}

const isLicenceLink = (link: { kind?: string | null; platform?: string | null }) => {
  const kind = (link.kind ?? link.platform ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return kind === "license" || kind === "licence" || kind === "license_text" || kind === "licence_text";
};

export function licenceUrl(model: Pick<ModelDetail, "license_url" | "model_links"> | null | undefined) {
  const direct = model?.license_url?.trim();
  if (direct) return direct;
  return model?.model_links?.find((link) => isLicenceLink(link) && link.url.trim())?.url.trim() ?? null;
}

/** Links other than the licence (which the About grid already shows). */
export const genericLinks = <T extends { kind?: string | null; platform?: string | null }>(links: T[] | null | undefined) => (links ?? []).filter((link) => !isLicenceLink(link));

const LINK_LABELS: Record<string, string> = {
  api_reference: "API reference", paper: "Paper", repository: "Repository", github: "Repository", weights: "Weights", huggingface: "Weights",
  documentation: "Documentation", docs: "Documentation", website: "Website", playground: "Playground", model_card: "Model card", announcement: "Announcement", blog: "Announcement",
};

export function linkLabel(link: { title?: string | null; kind?: string | null; platform?: string | null }) {
  if (link.title?.trim()) return link.title.trim();
  const kind = (link.kind ?? link.platform ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return LINK_LABELS[kind] ?? (kind ? kind.replace(/_/g, " ").replace(/^\w/, (letter) => letter.toUpperCase()) : "Link");
}

const ACRONYMS: Record<string, string> = { ai: "AI", gpt: "GPT", glm: "GLM", llm: "LLM", ocr: "OCR", stt: "STT", tts: "TTS" };

/** A readable name from an ID when the catalogue has none ("gpt-4-1" → "GPT 4.1"). */
export function fallbackModelName(modelId: string, generic: string) {
  const slug = modelId.split("/").at(-1)?.trim();
  if (!slug) return generic;
  const name = slug.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-(\d+)-(\d+)$/, "-$1.$2").split(/[-_]+/).filter(Boolean)
    .map((part) => ACRONYMS[part.toLowerCase()] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ");
  return name || generic;
}

export type Lineage = { previous: { modelId: string; modelName: string } | null; next: { modelId: string; modelName: string } | null };

/** Previous and next models from the timeline, falling back to `previous_model_id` (getModelLineageLinks). */
export function lineage(events: ModelTimelineEvent[] | null | undefined, previousModelId?: string | null, nameFor?: (id: string) => string | null | undefined): Lineage {
  const name = (id: string, given: string | undefined, generic: string) => {
    const trimmed = given?.trim();
    if (trimmed && trimmed !== id) return trimmed;
    return nameFor?.(id)?.trim() || fallbackModelName(id, generic);
  };
  const previousEvent = events?.find((event) => event.eventType === "PreviousModel" && event.modelId);
  const previousId = previousEvent?.modelId ?? previousModelId?.trim() ?? "";
  const nextEvent = events?.filter((event) => event.eventType === "FutureModel" && event.modelId).sort((a, b) => a.date.localeCompare(b.date))[0];
  return {
    previous: previousId ? { modelId: previousId, modelName: name(previousId, previousEvent?.modelName, "Previous model") } : null,
    next: nextEvent?.modelId ? { modelId: nextEvent.modelId, modelName: name(nextEvent.modelId, nextEvent.modelName, "Next model") } : null,
  };
}

/** "11 days ago", "in 3 weeks", "last month", "today": the website's relative date beside each key date (RelativeDateBadge). */
export function relativeDateLabel(value: string, now = new Date()) {
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const days = Math.round((day(target) - day(now)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  const abs = Math.abs(days);
  const [amount, unit] = abs < 14 ? [abs, "day" as const] : abs < 28 ? [Math.round(abs / 7), "week" as const] : abs < 730 ? [Math.round(abs / 30.4375), "month" as const] : [Math.round(abs / 365.25), "year" as const];
  return formatRelativeUnit(Math.sign(days) * amount, unit);
}

/** The calendar date in UTC ("7 Oct 2026"), in the app's date style. */
export function formatKeyDate(value: string) {
  return formatCalendarDate(value);
}
