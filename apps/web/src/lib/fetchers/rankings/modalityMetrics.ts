import type { ModalityTimeseriesMetric } from "./getRankingsData";

type ModalityMetric = { metric: ModalityTimeseriesMetric; title: string; unit: string };

export const modalityMetrics = {
	text: { metric: "text_tokens", title: "Text Tokens", unit: "tokens" },
	image: { metric: "image_outputs", title: "Images Generated", unit: "images" },
	embeddings: { metric: "embedding_tokens", title: "Embedding Tokens", unit: "tokens" },
	rerank: { metric: "rerank_quad_tokens", title: "Rerank Workload", unit: "quadtokens" },
	audio: { metric: "audio_tokens", title: "Audio Tokens", unit: "tokens" },
	video: { metric: "video_seconds", title: "Video Generated", unit: "seconds" },
	speech: { metric: "speech_seconds", title: "Speech Generated", unit: "seconds" },
	transcription: { metric: "transcription_seconds", title: "Audio Transcribed", unit: "seconds" },
} satisfies Record<string, ModalityMetric>;

export const secondaryModalityMetrics: Partial<Record<keyof typeof modalityMetrics, ModalityMetric>> = {
	image: { metric: "image_inputs", title: "Image Inputs", unit: "images" },
	audio: { metric: "audio_seconds", title: "Audio Duration", unit: "seconds" },
	video: { metric: "video_tokens", title: "Video Tokens", unit: "tokens" },
};
