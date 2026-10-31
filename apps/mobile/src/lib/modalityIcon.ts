import {
  ArrowUpDown, BadgeAlert, Binary, Captions, CircleDot, FileText, Headphones, ImageIcon, Languages, Music4, Radio, Scale, ScanText, Speech, Type, Video,
  type LucideIcon,
} from "lucide-react-native";

/** The icon the website's model filters use for each modality (apps/web ModelsDisplay getModalityIcon). */
export function modalityIcon(modality: string): LucideIcon {
  const value = modality.toLowerCase().replace(/[._/*-]+/g, " ").trim();
  if (value.includes("decision")) return Scale;
  if (value.includes("realtime") || value.includes("real time")) return Radio;
  if (/\bocr\b/.test(value) || /\bpars(e|ing)\b/.test(value) || value === "document" || value === "documents") return ScanText;
  if (value.includes("translat")) return Languages;
  if (value.includes("embed")) return Binary;
  if (value.includes("rerank") || value.includes("re rank")) return ArrowUpDown;
  if (value.includes("moderat")) return BadgeAlert;
  if (value.includes("image")) return ImageIcon;
  if (value.includes("video")) return Video;
  if (value.includes("music")) return Music4;
  if (value.includes("transcri") || value.includes("speech to text") || /\bstt\b/.test(value)) return Captions;
  if (value.includes("text to speech") || value.includes("audio speech") || value.includes("speech synth") || /\btts\b/.test(value)) return Speech;
  if (value.includes("audio")) return Headphones;
  if (value.includes("file") || value === "pdf") return FileText;
  if (value.includes("text")) return Type;
  return CircleDot;
}
