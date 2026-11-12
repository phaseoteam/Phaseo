import { useParams } from "@tanstack/react-router";
import { notFound } from "@/lib/navigation";
import RankingsPageContent, {
	isRankingModality,
	type RankingModality,
} from "../RankingsPageContent";

export default function RankingsModalityPage() {
	const { modality } = useParams({ from: "/{-$locale}/_dashboard/rankings/$modality/" });

	if (!isRankingModality(modality) || modality === "text") {
		notFound();
	}

	return <RankingsPageContent modality={modality as RankingModality} />;
}
