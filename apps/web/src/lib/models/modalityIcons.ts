import {
	ArrowUpDown,
	BadgeAlert,
	Binary,
	Captions,
	CircleDot,
	FileText,
	Headphones,
	Image as ImageIcon,
	Music4,
	Radio,
	Scale,
	Speech,
	Type,
	Video,
	type LucideIcon,
} from "lucide-react";

export function getModalityIcon(value: string): LucideIcon {
	const normalized = value.toLowerCase().replace(/[._/-]+/g, " ");
	if (normalized.includes("decision")) return Scale;
	if (normalized.includes("realtime") || normalized.includes("real time")) {
		return Radio;
	}
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
