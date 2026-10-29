import { formatLatency, formatRoundedCount, formatTokenCountShort, formatTps, formatUsdPrice } from "@phaseo/app-kit/format";

// Money, counts and unit prices are the website's styles, shared through @phaseo/app-kit/format.
// So are calendar dates, timestamps and "how long ago", in the website's wording, and token limits in full.
export { formatCalendarDate, formatTokenCount, formatDateParts, formatRelativeTime, formatRelativeUnit, formatTimestamp, formatUsd, formatUsdCost, MONEY_LOCALE } from "@phaseo/app-kit/format";

const whole = new Intl.NumberFormat("en-GB");
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const monthYear = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/** Counts of tokens or requests, as the website shows them: 999, 1.15K, 1.23M (rounded down). */
export function formatCompact(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : formatRoundedCount(value, "en-US");
}

export function formatNumber(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "—" : whole.format(Math.round(value));
}

/** Price per million tokens, as the website's /models list shows it: $0.035, $2.5, $1,234.5; "Free" at zero. */
export function formatPrice(value: number | null | undefined) {
  if (value === 0) return "Free";
  return formatUsdPrice(value) ?? "—";
}

export const nanosToUsd = (nanos: number | null | undefined) => (nanos == null ? null : nanos / 1_000_000_000);

/** File sizes: 0 B, 512 B, 4.2 KB, 12.3 MB, 1.05 GB (1 KB = 1,024 bytes). */
export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(value >= 10 ? 1 : 2))} ${units[unit]}`;
}

/** A token limit where space is short, as the website's short form: 1M, 131K, 8K. Detail rows use formatTokenCount ("131,072 tokens"). */
export function formatTokens(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) || value <= 0 ? "—" : formatTokenCountShort(value);
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

/** Latency in seconds, from milliseconds, as the website shows it: "0.85 s", "12.3 s". */
export function formatSeconds(value: number | null | undefined) {
  return formatLatency(value) ?? "—";
}

/** Output speed, as the website shows it: "45.3 tps", "123 tps". */
export function formatSpeed(value: number | null | undefined) {
  return formatTps(value) ?? "—";
}
