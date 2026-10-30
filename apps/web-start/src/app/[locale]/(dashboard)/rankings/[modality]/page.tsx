import { notFound } from "next/navigation";
import RankingsPageContent, {
	generateRankingsMetadata,
	isRankingModality,
	type RankingModality,
} from "../RankingsPageContent";

type RankingsModalityPageProps = {
	params: Promise<{ modality: string }>;
};

export const generateMetadata = generateRankingsMetadata;

export function generateStaticParams() {
	return [
		{ modality: "image" },
		{ modality: "embeddings" },
		{ modality: "rerank" },
		{ modality: "audio" },
		{ modality: "video" },
		{ modality: "speech" },
		{ modality: "transcription" },
	];
}

export default async function RankingsModalityPage({
	params,
}: RankingsModalityPageProps) {
	const { modality } = await params;

	if (!isRankingModality(modality) || modality === "text") {
		notFound();
	}

	return <RankingsPageContent modality={modality as RankingModality} />;
}
