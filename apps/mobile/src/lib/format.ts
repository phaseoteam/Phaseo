const compact = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-GB");
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

export function formatCompact(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : compact.format(value);
}

export function formatNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : whole.format(Math.round(value));
}

/** Price per million tokens: $0.14, $2, $0.0042. */
export function formatPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value === 0) return "Free";
  const digits = value >= 100 ? 0 : value >= 1 ? 2 : value >= 0.01 ? 3 : 4;
  return `$${Number(value.toFixed(digits)).toString()}`;
}

/** Money is always shown in the US style ("$1,234.50"), never "US$". */
export const MONEY_LOCALE = "en-US";

export function formatUsd(value: number | null | undefined, { precise = false }: { precise?: boolean } = {}) {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const digits = precise || abs < 1 ? (abs > 0 && abs < 0.01 ? 4 : 2) : 2;
  return new Intl.NumberFormat(MONEY_LOCALE, { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

export const nanosToUsd = (nanos: number | null | undefined) => (nanos == null ? null : nanos / 1_000_000_000);

/** Context window: 1M, 128K, 8K. */
export function formatTokens(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000) return `${Number((value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0))}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function toDate(value: string | number | Date | null | undefined) {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | number | Date | null | undefined) {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "—";
}

export function formatShortDate(value: string | number | Date | null | undefined) {
  const date = toDate(value);
  return date ? shortDate.format(date) : "—";
}

export function formatMonth(value: string | number | Date | null | undefined) {
  const date = toDate(value);
  return date ? monthYear.format(date) : "Undated";
}

/** "Today", "Yesterday", "3 days ago", then the date. */
export function formatRelativeDay(value: string | number | Date | null | undefined, now = new Date()) {
  const date = toDate(value);
  if (!date) return "—";
  const days = Math.floor((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return `${days} days ago`;
  if (days < 0 && days > -7) return days === -1 ? "Tomorrow" : `In ${-days} days`;
  return formatDate(date);
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const MODALITY_LABELS: Record<string, string> = {
  text: "Text", image: "Image", audio: "Audio", video: "Video", embedding: "Embeddings", embeddings: "Embeddings",
  moderation: "Moderation", moderations: "Moderation", file: "Files", pdf: "PDF", document: "Documents",
  audio_tts: "Speech", audio_stt: "Transcription", audio_music: "Music", music: "Music", rerank: "Rerank",
};

/** "audio_tts" → "Speech", "image/*" → "Image"; unknown values lose underscores and get a capital. */
export function modalityLabel(value: string) {
  const key = value.replace(/\/\*$/, "");
  if (MODALITY_LABELS[key]) return MODALITY_LABELS[key];
  const words = key.replace(/[_-]+/g, " ").trim();
  return words.slice(0, 1).toUpperCase() + words.slice(1);
}

export function formatPercent(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(digits)}%`;
}

export function formatMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`;
}
