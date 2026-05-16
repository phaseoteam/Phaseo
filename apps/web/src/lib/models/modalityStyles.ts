function normalizeModalityStyleKey(value: string): string {
	const normalized = String(value ?? "")
		.trim()
		.toLowerCase()
		.replace(/[._/-]+/g, " ");
	if (!normalized) return "";
	if (normalized.includes("embed")) return "embeddings";
	if (normalized.includes("rerank") || normalized.includes("re rank")) {
		return "rerank";
	}
	if (normalized.includes("moderat")) return "moderations";
	if (normalized.includes("image")) return "image";
	if (normalized.includes("video")) return "video";
	if (normalized.includes("music")) return "audio_music";
	if (
		normalized.includes("transcrib") ||
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
			"border-[#93C5FD] bg-[#EFF6FF] text-[#1D4ED8] dark:border-[#3B82F6] dark:bg-[#0F1E3A] dark:text-[#BFDBFE]",
		iconClassName: "text-[#2563EB] dark:text-[#93C5FD]",
		ghostIconHoverClassName:
			"group-hover:text-[#2563EB] dark:group-hover:text-[#93C5FD]",
		sidebarIconHoverClassName:
			"group-hover:border-[#93C5FD] group-hover:bg-[#EFF6FF] group-hover:text-[#2563EB] dark:group-hover:border-[#3B82F6] dark:group-hover:bg-[#0F1E3A] dark:group-hover:text-[#93C5FD]",
		sidebarIconSelectedClassName:
			"border-[#93C5FD] bg-[#EFF6FF] text-[#2563EB] dark:border-[#3B82F6] dark:bg-[#0F1E3A] dark:text-[#93C5FD]",
	},
	image: {
		badgeClassName:
			"border-[#F6A7C8] bg-[#FFF1F7] text-[#C24D80] dark:border-[#A9476B] dark:bg-[#311320] dark:text-[#FFC1DC]",
		iconClassName: "text-[#DB5F96] dark:text-[#FFB2D2]",
		ghostIconHoverClassName:
			"group-hover:text-[#DB5F96] dark:group-hover:text-[#FFB2D2]",
		sidebarIconHoverClassName:
			"group-hover:border-[#F6A7C8] group-hover:bg-[#FFF1F7] group-hover:text-[#DB5F96] dark:group-hover:border-[#A9476B] dark:group-hover:bg-[#311320] dark:group-hover:text-[#FFB2D2]",
		sidebarIconSelectedClassName:
			"border-[#F6A7C8] bg-[#FFF1F7] text-[#DB5F96] dark:border-[#A9476B] dark:bg-[#311320] dark:text-[#FFB2D2]",
	},
	video: {
		badgeClassName:
			"border-[#C9B0FF] bg-[#F5EEFF] text-[#7C54D7] dark:border-[#7652C7] dark:bg-[#211534] dark:text-[#D6BEFF]",
		iconClassName: "text-[#8A5CF0] dark:text-[#C8A8FF]",
		ghostIconHoverClassName:
			"group-hover:text-[#8A5CF0] dark:group-hover:text-[#C8A8FF]",
		sidebarIconHoverClassName:
			"group-hover:border-[#C9B0FF] group-hover:bg-[#F5EEFF] group-hover:text-[#8A5CF0] dark:group-hover:border-[#7652C7] dark:group-hover:bg-[#211534] dark:group-hover:text-[#C8A8FF]",
		sidebarIconSelectedClassName:
			"border-[#C9B0FF] bg-[#F5EEFF] text-[#8A5CF0] dark:border-[#7652C7] dark:bg-[#211534] dark:text-[#C8A8FF]",
	},
	audio: {
		badgeClassName:
			"border-[#8FD9E7] bg-[#ECFAFD] text-[#1E8098] dark:border-[#2F7E8F] dark:bg-[#0B2730] dark:text-[#A5EAF8]",
		iconClassName: "text-[#2A99B4] dark:text-[#8CE6F7]",
		ghostIconHoverClassName:
			"group-hover:text-[#2A99B4] dark:group-hover:text-[#8CE6F7]",
		sidebarIconHoverClassName:
			"group-hover:border-[#8FD9E7] group-hover:bg-[#ECFAFD] group-hover:text-[#2A99B4] dark:group-hover:border-[#2F7E8F] dark:group-hover:bg-[#0B2730] dark:group-hover:text-[#8CE6F7]",
		sidebarIconSelectedClassName:
			"border-[#8FD9E7] bg-[#ECFAFD] text-[#2A99B4] dark:border-[#2F7E8F] dark:bg-[#0B2730] dark:text-[#8CE6F7]",
	},
	audio_tts: {
		badgeClassName:
			"border-[#9BDFB9] bg-[#F0FBF4] text-[#287B49] dark:border-[#347A51] dark:bg-[#11261A] dark:text-[#B3F2C9]",
		iconClassName: "text-[#33A05E] dark:text-[#98EBB7]",
		ghostIconHoverClassName:
			"group-hover:text-[#33A05E] dark:group-hover:text-[#98EBB7]",
		sidebarIconHoverClassName:
			"group-hover:border-[#9BDFB9] group-hover:bg-[#F0FBF4] group-hover:text-[#33A05E] dark:group-hover:border-[#347A51] dark:group-hover:bg-[#11261A] dark:group-hover:text-[#98EBB7]",
		sidebarIconSelectedClassName:
			"border-[#9BDFB9] bg-[#F0FBF4] text-[#33A05E] dark:border-[#347A51] dark:bg-[#11261A] dark:text-[#98EBB7]",
	},
	audio_stt: {
		badgeClassName:
			"border-[#F2CF8F] bg-[#FFF8E8] text-[#A36A17] dark:border-[#9A6B20] dark:bg-[#31240D] dark:text-[#FFD88A]",
		iconClassName: "text-[#C1841B] dark:text-[#F8C96B]",
		ghostIconHoverClassName:
			"group-hover:text-[#C1841B] dark:group-hover:text-[#F8C96B]",
		sidebarIconHoverClassName:
			"group-hover:border-[#F2CF8F] group-hover:bg-[#FFF8E8] group-hover:text-[#C1841B] dark:group-hover:border-[#9A6B20] dark:group-hover:bg-[#31240D] dark:group-hover:text-[#F8C96B]",
		sidebarIconSelectedClassName:
			"border-[#F2CF8F] bg-[#FFF8E8] text-[#C1841B] dark:border-[#9A6B20] dark:bg-[#31240D] dark:text-[#F8C96B]",
	},
	audio_music: {
		badgeClassName:
			"border-[#E6B0F0] bg-[#FDF0FF] text-[#A548B7] dark:border-[#9150A8] dark:bg-[#2F1336] dark:text-[#F2B7FF]",
		iconClassName: "text-[#C15AD7] dark:text-[#EEA7FF]",
		ghostIconHoverClassName:
			"group-hover:text-[#C15AD7] dark:group-hover:text-[#EEA7FF]",
		sidebarIconHoverClassName:
			"group-hover:border-[#E6B0F0] group-hover:bg-[#FDF0FF] group-hover:text-[#C15AD7] dark:group-hover:border-[#9150A8] dark:group-hover:bg-[#2F1336] dark:group-hover:text-[#EEA7FF]",
		sidebarIconSelectedClassName:
			"border-[#E6B0F0] bg-[#FDF0FF] text-[#C15AD7] dark:border-[#9150A8] dark:bg-[#2F1336] dark:text-[#EEA7FF]",
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
			"border-[#F2A4A4] bg-[#FFF1F1] text-[#B24949] dark:border-[#9A4545] dark:bg-[#311515] dark:text-[#FFB6B6]",
		iconClassName: "text-[#D45B5B] dark:text-[#FFAAAA]",
		ghostIconHoverClassName:
			"group-hover:text-[#D45B5B] dark:group-hover:text-[#FFAAAA]",
		sidebarIconHoverClassName:
			"group-hover:border-[#F2A4A4] group-hover:bg-[#FFF1F1] group-hover:text-[#D45B5B] dark:group-hover:border-[#9A4545] dark:group-hover:bg-[#311515] dark:group-hover:text-[#FFAAAA]",
		sidebarIconSelectedClassName:
			"border-[#F2A4A4] bg-[#FFF1F1] text-[#D45B5B] dark:border-[#9A4545] dark:bg-[#311515] dark:text-[#FFAAAA]",
	},
	rerank: {
		badgeClassName:
			"border-[#97DDD2] bg-[#EDFBF8] text-[#247E74] dark:border-[#2F7A72] dark:bg-[#0E2826] dark:text-[#A6EFE3]",
		iconClassName: "text-[#2F9C90] dark:text-[#8FE6D9]",
		ghostIconHoverClassName:
			"group-hover:text-[#2F9C90] dark:group-hover:text-[#8FE6D9]",
		sidebarIconHoverClassName:
			"group-hover:border-[#97DDD2] group-hover:bg-[#EDFBF8] group-hover:text-[#2F9C90] dark:group-hover:border-[#2F7A72] dark:group-hover:bg-[#0E2826] dark:group-hover:text-[#8FE6D9]",
		sidebarIconSelectedClassName:
			"border-[#97DDD2] bg-[#EDFBF8] text-[#2F9C90] dark:border-[#2F7A72] dark:bg-[#0E2826] dark:text-[#8FE6D9]",
	},
	embeddings: {
		badgeClassName:
			"border-[#AEB8F3] bg-[#F2F4FF] text-[#5767B7] dark:border-[#5460A8] dark:bg-[#161C35] dark:text-[#C0C9FF]",
		iconClassName: "text-[#6A79D1] dark:text-[#B4BEFF]",
		ghostIconHoverClassName:
			"group-hover:text-[#6A79D1] dark:group-hover:text-[#B4BEFF]",
		sidebarIconHoverClassName:
			"group-hover:border-[#AEB8F3] group-hover:bg-[#F2F4FF] group-hover:text-[#6A79D1] dark:group-hover:border-[#5460A8] dark:group-hover:bg-[#161C35] dark:group-hover:text-[#B4BEFF]",
		sidebarIconSelectedClassName:
			"border-[#AEB8F3] bg-[#F2F4FF] text-[#6A79D1] dark:border-[#5460A8] dark:bg-[#161C35] dark:text-[#B4BEFF]",
	},
};

export function getModalityTone(value: string): ModalityTone {
	return MODALITY_TONES[normalizeModalityStyleKey(value)] ?? DEFAULT_MODALITY_TONE;
}
