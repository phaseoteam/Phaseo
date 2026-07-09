import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { ImageStudioRoom } from "@/components/(chat)/rooms/ImageStudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Image Studio - Phaseo Chat",
	description: "Prompt-first image generation workspace with gallery history.",
	path: "/chat/image",
	keywords: ["AI image generation", "image studio", "Phaseo chat"],
});

export default async function ChatImagePage() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<ImageStudioRoom models={models} />
		</RoomScaffold>
	);
}
