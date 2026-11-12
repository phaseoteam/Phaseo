import {
  ArrowUpDown,
  BadgeAlert,
  Binary,
  Captions,
  CircleDot,
  FileText,
  Headphones,
  ImageIcon,
  Music4,
  Radio,
  Scale,
  Speech,
  TextSelect,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react";

// The website's modality icons, labels, order and colours
// (apps/web/src/components/(data)/models/Models/modalityIcons.ts and
// apps/web/src/lib/models/modalityStyles.ts). The colours are content accents, as
// both hosts allow; the structural colours come from the host.

export function modalityKey(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[._/-]+/g, " ");
  if (normalized.includes("realtime") || normalized.includes("real time")) return "realtime";
  if (/\bocr\b/.test(normalized) || /\bpars(e|ing)\b/.test(normalized)) return "documents";
  if (normalized.includes("translat")) return "translation";
  if (normalized.includes("embed")) return "embeddings";
  if (normalized.includes("rerank") || normalized.includes("re rank")) return "rerank";
  if (normalized.includes("moderat")) return "moderations";
  if (normalized.includes("extract")) return "extraction";
  if (normalized.includes("decision")) return "decisions";
  if (normalized.includes("image")) return "image";
  if (normalized.includes("video")) return "video";
  if (normalized.includes("music")) return "audio_music";
  if (/transcri|speech to text|\bstt\b/.test(normalized)) return "audio_stt";
  if (/text to speech|audio speech|speech synth|\btts\b/.test(normalized)) return "audio_tts";
  if (normalized.includes("audio")) return "audio";
  if (normalized.includes("file")) return "file";
  if (normalized.includes("text")) return "text";
  return normalized.replace(/\s+/g, "_");
}

const ICONS: Record<string, LucideIcon> = {
  extraction: TextSelect,
  decisions: Scale,
  realtime: Radio,
  embeddings: Binary,
  rerank: ArrowUpDown,
  moderations: BadgeAlert,
  file: FileText,
  documents: FileText,
  image: ImageIcon,
  audio_music: Music4,
  audio_stt: Captions,
  audio_tts: Speech,
  video: Video,
  audio: Headphones,
  text: Type,
};

const LABELS: Record<string, string> = {
  realtime: "Realtime",
  extraction: "Extraction",
  audio_stt: "Transcription",
  audio_tts: "Speech",
  audio_music: "Music",
};

const ORDER = [
  "text",
  "image",
  "audio",
  "audio_tts",
  "realtime",
  "audio_stt",
  "audio_music",
  "video",
  "rerank",
  "embeddings",
  "moderations",
  "decisions",
];

export function modalityLabel(value: string): string {
  const key = modalityKey(value);
  if (LABELS[key]) return LABELS[key];
  return value
    .replace(/[._/-]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function sortModalities(values: string[]): string[] {
  const rank = (value: string) => {
    const index = ORDER.indexOf(modalityKey(value));
    return index === -1 ? ORDER.length : index;
  };
  return [...new Set(values)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function ModalityBadge({ value }: { value: string }) {
  const key = modalityKey(value);
  const Icon = ICONS[key] ?? CircleDot;
  return (
    <span className="modality" data-tone={key}>
      <Icon aria-hidden="true" />
      {modalityLabel(value)}
    </span>
  );
}

export function ModalityIcon({ value }: { value: string }) {
  const Icon = ICONS[modalityKey(value)] ?? CircleDot;
  return <Icon aria-hidden="true" />;
}
