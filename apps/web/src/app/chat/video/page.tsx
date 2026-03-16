import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { MediaStudioRoom } from "@/components/(chat)/rooms/MediaStudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Video Studio - AI Stats Chat",
	description: "Prompt-first video generation workspace with async polling.",
	path: "/chat/video",
	keywords: ["AI video generation", "video studio", "AI Stats chat"],
});

export default async function ChatVideoPage() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<MediaStudioRoom roomId="video" models={models} />
		</RoomScaffold>
	);
}
