function normalizeModalityStyleKey(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[._/-]+/g, " ");
	if (!normalized) return "";
	if (normalized.includes("realtime") || normalized.includes("real time")) {
		return "realtime";
	}
	if (/\bocr\b/.test(normalized) || /\bpars(e|ing)\b/.test(normalized)) {
		return "documents";
	}
	if (normalized.includes("translat")) return "translation";
	if (normalized.includes("embed")) return "embeddings";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("decision")) return "decisions";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("music")) return "audio_music";
	if (
		normalized.includes("transcri") ||
		normalized.includes("speech to text") ||
		normalized.includes("stt")
	) {
		return "audio_stt";
	}
	if (
		normalized.includes("text to speech") ||
		normalized.includes("audio speech") ||
		normalized.includes("speech synth") ||
		normalized.includes("tts")
	) {
		return "audio_tts";
	}
	if (normalized.includes("audio")) return "audio";
	if (normalized.includes("file")) return "file";
	if (normalized.includes("text")) return "text";
	return normalized.replace(/\s+/g, "_");
}

type ModalityTone = {
	badgeClassName: string;
	iconClassName: string;
	ghostIconHoverClassName: string;
	sidebarIconHoverClassName: string;
	sidebarIconSelectedClassName: string;
};

const DEFAULT_MODALITY_TONE: ModalityTone = {
	badgeClassName:
		"border-[#CAD5E2] bg-[#F6F8FB] text-[#516070] dark:border-[#4B5563] dark:bg-[#1F2937] dark:text-[#E5E7EB]",
	iconClassName: "text-[#64748B] dark:text-[#CBD5E1]",
	ghostIconHoverClassName:
		"group-hover:text-[#64748B] dark:group-hover:text-[#CBD5E1]",
	sidebarIconHoverClassName:
		"group-hover:border-[#CAD5E2] group-hover:bg-[#F6F8FB] group-hover:text-[#64748B] dark:group-hover:border-[#4B5563] dark:group-hover:bg-[#1F2937] dark:group-hover:text-[#CBD5E1]",
	sidebarIconSelectedClassName:
		"border-[#CAD5E2] bg-[#F6F8FB] text-[#64748B] dark:border-[#4B5563] dark:bg-[#1F2937] dark:text-[#CBD5E1]",
};

const MODALITY_TONES: Record<string, ModalityTone> = {
	text: {
		badgeClassName:
			"border-transparent bg-[#DBEAFE] text-[#1E40AF] dark:border-transparent dark:bg-[#0F1E3A] dark:text-[#93C5FD]",
		iconClassName: "text-[#1E40AF] dark:text-[#93C5FD]",
		ghostIconHoverClassName:
			"group-hover:text-[#1E40AF] dark:group-hover:text-[#93C5FD]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#DBEAFE] group-hover:text-[#1E40AF] dark:group-hover:border-transparent dark:group-hover:bg-[#0F1E3A] dark:group-hover:text-[#93C5FD]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#DBEAFE] text-[#1E40AF] dark:border-transparent dark:bg-[#0F1E3A] dark:text-[#93C5FD]",
	},
	image: {
		badgeClassName:
			"border-transparent bg-[#FCE0ED] text-[#9D174D] dark:border-transparent dark:bg-[#311320] dark:text-[#F9A8D4]",
		iconClassName: "text-[#9D174D] dark:text-[#F9A8D4]",
		ghostIconHoverClassName:
			"group-hover:text-[#9D174D] dark:group-hover:text-[#F9A8D4]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#FCE0ED] group-hover:text-[#9D174D] dark:group-hover:border-transparent dark:group-hover:bg-[#311320] dark:group-hover:text-[#F9A8D4]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#FCE0ED] text-[#9D174D] dark:border-transparent dark:bg-[#311320] dark:text-[#F9A8D4]",
	},
	video: {
		badgeClassName:
			"border-transparent bg-[#EDE1FE] text-[#5B21B6] dark:border-transparent dark:bg-[#211534] dark:text-[#C4B5FD]",
		iconClassName: "text-[#5B21B6] dark:text-[#C4B5FD]",
		ghostIconHoverClassName:
			"group-hover:text-[#5B21B6] dark:group-hover:text-[#C4B5FD]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#EDE1FE] group-hover:text-[#5B21B6] dark:group-hover:border-transparent dark:group-hover:bg-[#211534] dark:group-hover:text-[#C4B5FD]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#EDE1FE] text-[#5B21B6] dark:border-transparent dark:bg-[#211534] dark:text-[#C4B5FD]",
	},
	audio: {
		badgeClassName:
			"border-transparent bg-[#CFF3FA] text-[#155E75] dark:border-transparent dark:bg-[#0B2730] dark:text-[#8CE6F7]",
		iconClassName: "text-[#155E75] dark:text-[#8CE6F7]",
		ghostIconHoverClassName:
			"group-hover:text-[#155E75] dark:group-hover:text-[#8CE6F7]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#CFF3FA] group-hover:text-[#155E75] dark:group-hover:border-transparent dark:group-hover:bg-[#0B2730] dark:group-hover:text-[#8CE6F7]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#CFF3FA] text-[#155E75] dark:border-transparent dark:bg-[#0B2730] dark:text-[#8CE6F7]",
	},
	realtime: {
		badgeClassName:
			"border-transparent bg-[#FFE2CC] text-[#9A3412] dark:border-transparent dark:bg-[#351B0C] dark:text-[#FDBA74]",
		iconClassName: "text-[#9A3412] dark:text-[#FDBA74]",
		ghostIconHoverClassName:
			"group-hover:text-[#9A3412] dark:group-hover:text-[#FDBA74]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#FFE2CC] group-hover:text-[#9A3412] dark:group-hover:border-transparent dark:group-hover:bg-[#351B0C] dark:group-hover:text-[#FDBA74]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#FFE2CC] text-[#9A3412] dark:border-transparent dark:bg-[#351B0C] dark:text-[#FDBA74]",
	},
	audio_tts: {
		badgeClassName:
			"border-transparent bg-[#DCF2E2] text-[#166534] dark:border-transparent dark:bg-[#11261A] dark:text-[#98EBB7]",
		iconClassName: "text-[#166534] dark:text-[#98EBB7]",
		ghostIconHoverClassName:
			"group-hover:text-[#166534] dark:group-hover:text-[#98EBB7]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#DCF2E2] group-hover:text-[#166534] dark:group-hover:border-transparent dark:group-hover:bg-[#11261A] dark:group-hover:text-[#98EBB7]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#DCF2E2] text-[#166534] dark:border-transparent dark:bg-[#11261A] dark:text-[#98EBB7]",
	},
	audio_stt: {
		badgeClassName:
			"border-transparent bg-[#FEF0C3] text-[#854D0E] dark:border-transparent dark:bg-[#31240D] dark:text-[#F8C96B]",
		iconClassName: "text-[#854D0E] dark:text-[#F8C96B]",
		ghostIconHoverClassName:
			"group-hover:text-[#854D0E] dark:group-hover:text-[#F8C96B]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#FEF0C3] group-hover:text-[#854D0E] dark:group-hover:border-transparent dark:group-hover:bg-[#31240D] dark:group-hover:text-[#F8C96B]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#FEF0C3] text-[#854D0E] dark:border-transparent dark:bg-[#31240D] dark:text-[#F8C96B]",
	},
	audio_music: {
		badgeClassName:
			"border-transparent bg-[#F5DDF9] text-[#86198F] dark:border-transparent dark:bg-[#351139] dark:text-[#F0ABFC]",
		iconClassName: "text-[#86198F] dark:text-[#F0ABFC]",
		ghostIconHoverClassName:
			"group-hover:text-[#86198F] dark:group-hover:text-[#F0ABFC]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#F5DDF9] group-hover:text-[#86198F] dark:group-hover:border-transparent dark:group-hover:bg-[#351139] dark:group-hover:text-[#F0ABFC]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#F5DDF9] text-[#86198F] dark:border-transparent dark:bg-[#351139] dark:text-[#F0ABFC]",
	},
	file: {
		badgeClassName:
			"border-[#CBE48C] bg-[#F7FDEB] text-[#6A8B19] dark:border-[#6B8A2F] dark:bg-[#202A10] dark:text-[#D8F39C]",
		iconClassName: "text-[#86AF21] dark:text-[#CAEC86]",
		ghostIconHoverClassName:
			"group-hover:text-[#86AF21] dark:group-hover:text-[#CAEC86]",
		sidebarIconHoverClassName:
			"group-hover:border-[#CBE48C] group-hover:bg-[#F7FDEB] group-hover:text-[#86AF21] dark:group-hover:border-[#6B8A2F] dark:group-hover:bg-[#202A10] dark:group-hover:text-[#CAEC86]",
		sidebarIconSelectedClassName:
			"border-[#CBE48C] bg-[#F7FDEB] text-[#86AF21] dark:border-[#6B8A2F] dark:bg-[#202A10] dark:text-[#CAEC86]",
	},
	moderations: {
		badgeClassName:
			"border-transparent bg-[#FCE0DE] text-[#991B1B] dark:border-transparent dark:bg-[#311515] dark:text-[#FFAAAA]",
		iconClassName: "text-[#991B1B] dark:text-[#FFAAAA]",
		ghostIconHoverClassName:
			"group-hover:text-[#991B1B] dark:group-hover:text-[#FFAAAA]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#FCE0DE] group-hover:text-[#991B1B] dark:group-hover:border-transparent dark:group-hover:bg-[#311515] dark:group-hover:text-[#FFAAAA]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#FCE0DE] text-[#991B1B] dark:border-transparent dark:bg-[#311515] dark:text-[#FFAAAA]",
	},
	decisions: {
		badgeClassName:
			"border-transparent bg-[#EDE8E2] text-[#44403C] dark:border-transparent dark:bg-[#292524] dark:text-[#D6D3D1]",
		iconClassName: "text-[#44403C] dark:text-[#D6D3D1]",
		ghostIconHoverClassName:
			"group-hover:text-[#44403C] dark:group-hover:text-[#D6D3D1]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#EDE8E2] group-hover:text-[#44403C] dark:group-hover:border-transparent dark:group-hover:bg-[#292524] dark:group-hover:text-[#D6D3D1]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#EDE8E2] text-[#44403C] dark:border-transparent dark:bg-[#292524] dark:text-[#D6D3D1]",
	},
	rerank: {
		badgeClassName:
			"border-transparent bg-[#CCF1E9] text-[#115E59] dark:border-transparent dark:bg-[#0E2826] dark:text-[#8FE6D9]",
		iconClassName: "text-[#115E59] dark:text-[#8FE6D9]",
		ghostIconHoverClassName:
			"group-hover:text-[#115E59] dark:group-hover:text-[#8FE6D9]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#CCF1E9] group-hover:text-[#115E59] dark:group-hover:border-transparent dark:group-hover:bg-[#0E2826] dark:group-hover:text-[#8FE6D9]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#CCF1E9] text-[#115E59] dark:border-transparent dark:bg-[#0E2826] dark:text-[#8FE6D9]",
	},
	embeddings: {
		badgeClassName:
			"border-transparent bg-[#E2EAF3] text-[#334155] dark:border-transparent dark:bg-[#202936] dark:text-[#CBD5E1]",
		iconClassName: "text-[#334155] dark:text-[#CBD5E1]",
		ghostIconHoverClassName:
			"group-hover:text-[#334155] dark:group-hover:text-[#CBD5E1]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#E2EAF3] group-hover:text-[#334155] dark:group-hover:border-transparent dark:group-hover:bg-[#202936] dark:group-hover:text-[#CBD5E1]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#E2EAF3] text-[#334155] dark:border-transparent dark:bg-[#202936] dark:text-[#CBD5E1]",
	},
	documents: {
		badgeClassName:
			"border-transparent bg-[#DEDDFC] text-[#3730A3] dark:border-transparent dark:bg-[#1A1840] dark:text-[#A5A9FC]",
		iconClassName: "text-[#3730A3] dark:text-[#A5A9FC]",
		ghostIconHoverClassName:
			"group-hover:text-[#3730A3] dark:group-hover:text-[#A5A9FC]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#DEDDFC] group-hover:text-[#3730A3] dark:group-hover:border-transparent dark:group-hover:bg-[#1A1840] dark:group-hover:text-[#A5A9FC]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#DEDDFC] text-[#3730A3] dark:border-transparent dark:bg-[#1A1840] dark:text-[#A5A9FC]",
	},
	translation: {
		badgeClassName:
			"border-transparent bg-[#F1E4D3] text-[#7C4A1E] dark:border-transparent dark:bg-[#2A1C10] dark:text-[#E2B98C]",
		iconClassName: "text-[#7C4A1E] dark:text-[#E2B98C]",
		ghostIconHoverClassName:
			"group-hover:text-[#7C4A1E] dark:group-hover:text-[#E2B98C]",
		sidebarIconHoverClassName:
			"group-hover:border-transparent group-hover:bg-[#F1E4D3] group-hover:text-[#7C4A1E] dark:group-hover:border-transparent dark:group-hover:bg-[#2A1C10] dark:group-hover:text-[#E2B98C]",
		sidebarIconSelectedClassName:
			"border-transparent bg-[#F1E4D3] text-[#7C4A1E] dark:border-transparent dark:bg-[#2A1C10] dark:text-[#E2B98C]",
	},
};

export function getModalityTone(value: string): ModalityTone {
	return MODALITY_TONES[normalizeModalityStyleKey(value)] ?? DEFAULT_MODALITY_TONE;
}
