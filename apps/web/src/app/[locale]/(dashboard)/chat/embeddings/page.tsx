import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { EmbeddingsRoom } from "@/components/(chat)/rooms/EmbeddingsRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("embeddings"), description: t("embeddingsDescription"), path: "/chat/embeddings", keywords: ["embeddings", "multimodal embeddings", "vector graph", "PCA"] });
}

export default function ChatEmbeddingsPage() {
	return <Suspense fallback={null}><ChatEmbeddingsContent /></Suspense>;
}

function ChatEmbeddingsContent() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return (
		<RoomScaffold>
			<EmbeddingsRoom models={models} />
		</RoomScaffold>
	);
}
