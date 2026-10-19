import {
	ArrowUpDown,
	BadgeAlert,
	Binary,
	Captions,
	CircleDot,
	FileText,
	Headphones,
	Image as ImageIcon,
	Languages,
	Music4,
	Radio,
	Scale,
	ScanText,
	createLucideIcon,
	Speech,
	Type,
	Video,
	type LucideIcon,
} from "lucide-react";

// Source lines narrow into a typed value enclosed by brackets.
export const ExtractionIcon = createLucideIcon("Extraction", [
	["path", { d: "M3 5h10M3 9h7M3 13h4", key: "source" }],
	["path", { d: "m10 13 3 3-3 3M13 16h3", key: "extract" }],
	["path", { d: "M19 12h-2v8h2M21 12h2v8h-2", key: "value" }],
]);

export function getModalityIcon(value: string): LucideIcon {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("extract")) return ExtractionIcon;
	if (normalized.includes("decision")) return Scale;
	if (normalized.includes("realtime") || normalized.includes("real time")) {
		return Radio;
	}
	if (
		/\bocr\b/.test(normalized) ||
		/\bpars(e|ing)\b/.test(normalized) ||
		normalized === "documents"
	) {
		return ScanText;
	}
	if (normalized.includes("translat")) return Languages;
	if (normalized.includes("embed")) return Binary;
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return ArrowUpDown;
	}
	if (normalized.includes("moderat")) return BadgeAlert;
	if (normalized.includes("file")) return FileText;
	if (normalized.includes("image")) return ImageIcon;
	if (normalized.includes("music")) return Music4;
	if (
		normalized.includes("transcri") ||
		normalized.includes("speech to text") ||
		normalized.includes("stt")
	) {
		return Captions;
	}
	if (
		normalized.includes("text to speech") ||
		normalized.includes("audio speech") ||
		normalized.includes("speech synth") ||
		normalized.includes("tts")
	) {
		return Speech;
	}
	if (normalized.includes("video")) return Video;
	if (normalized.includes("audio")) return Headphones;
	if (normalized.includes("text")) return Type;
	return CircleDot;
}
