import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { EmbeddingsRoom } from "@/components/(chat)/rooms/EmbeddingsRoom";

export const metadata: Metadata = buildMetadata({
	title: "Embeddings",
	description:
		"Generate multimodal embeddings and inspect vectors on a 2D projection.",
	path: "/chat/embeddings",
	keywords: ["embeddings", "multimodal embeddings", "vector graph", "PCA"],
});

export default function ChatEmbeddingsPage() {
	return <Suspense fallback={null}><ChatEmbeddingsContent /></Suspense>;
}

async function ChatEmbeddingsContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<EmbeddingsRoom models={models} />
		</RoomScaffold>
	);
}
