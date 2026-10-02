import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { EmbeddingsRoom } from "@/components/(chat)/rooms/EmbeddingsRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("embeddings"), description: t("embeddingsDescription"), path: "/chat/embeddings", keywords: ["embeddings", "multimodal embeddings", "vector graph", "PCA"] });
}

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
