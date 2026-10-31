import RankingsPageContent, {
	generateRankingsMetadata,
} from "./RankingsPageContent";

export const generateMetadata = generateRankingsMetadata;

export default function RankingsPage() {
	return <RankingsPageContent modality="text" />;
}
