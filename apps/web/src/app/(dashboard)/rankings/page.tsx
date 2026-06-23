import RankingsPageContent, {
	generateRankingsMetadata,
} from "./RankingsPageContent";

export const generateMetadata = generateRankingsMetadata;

export default async function RankingsPage() {
	return <RankingsPageContent modality="text" />;
}
