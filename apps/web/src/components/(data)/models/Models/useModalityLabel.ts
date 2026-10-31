import { useCallback } from "react";
import { useTranslations } from "@/i18n/react";
import { normalizeModalityFilterValue } from "./modalityOrder";

// Same names the models page filters use for each modality.
const METADATA_KEYS: Record<string, string> = {
	text: "modalityText",
	image: "modalityImage",
	video: "modalityVideo",
	audio: "modalityAudio",
	audio_tts: "modalitySpeech",
	audio_stt: "modalityTranscription",
	audio_music: "modalityMusic",
	embeddings: "modalityEmbeddings",
	moderations: "modalityModeration",
};

const FILTER_KEYS: Record<string, string> = {
	decision: "modalityClassification",
	decisions: "modalityDecisions",
	extraction: "modalityExtraction",
	realtime: "modalityRealtime",
	file: "modalityFile",
	rerank: "modalityRerank",
	documents: "modalityDocuments",
	translation: "modalityTranslation",
};

export function useModalityLabel(): (value: string) => string {
	const tMetadata = useTranslations("Catalogue.modelDetail.metadata");
	const tFilters = useTranslations("Catalogue.models.filtersUi");
	return useCallback(
		(value: string) => {
			const key = normalizeModalityFilterValue(value);
			if (METADATA_KEYS[key]) return tMetadata(METADATA_KEYS[key] as never);
			if (FILTER_KEYS[key]) return tFilters(FILTER_KEYS[key] as never);
			return key
				.split("_")
				.filter(Boolean)
				.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
				.join(" ");
		},
		[tFilters, tMetadata],
	);
}
