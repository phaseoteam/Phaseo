import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { VideoStudioRoom } from "@/components/(chat)/rooms/VideoStudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Video Studio",
	description: "Prompt-first video generation workspace with async polling.",
	path: "/chat/video",
	keywords: ["AI video generation", "video studio", "Phaseo chat"],
});

export default async function ChatVideoPage() {
	const models = await fetchFrontendGatewayModels();

	return (
		<RoomScaffold>
			<VideoStudioRoom models={models} />
		</RoomScaffold>
	);
}
