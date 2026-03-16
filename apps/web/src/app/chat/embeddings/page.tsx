import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { EmbeddingsRoom } from "@/components/(chat)/rooms/EmbeddingsRoom";

export const metadata: Metadata = buildMetadata({
	title: "Embeddings Room - AI Stats Chat",
	description:
		"Generate multimodal embeddings and inspect vectors on a 2D projection.",
	path: "/chat/embeddings",
	keywords: ["embeddings", "multimodal embeddings", "vector graph", "PCA"],
});

export default async function ChatEmbeddingsPage() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<EmbeddingsRoom models={models} />
		</RoomScaffold>
	);
}
