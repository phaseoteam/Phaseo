import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DocumentToolsRoom } from "@/components/(chat)/rooms/DocumentToolsRoom";

export async function generateMetadata() {
	const t = await getTranslations("Product.chat.newRooms");
	const roomsT = await getTranslations("Common.ui.chatRooms");
	return buildMetadata({ title: roomsT("rerank"), description: t("rerankDescription"), path: "/chat/rerank" });
}

export default async function ChatRerankPage() {
	const t = await getTranslations("Product.chat.newRooms");
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">{t("rerankLoading")}</p>}><RerankContent /></Suspense></RoomScaffold>;
}

async function RerankContent() {
	const models = await fetchFrontendGatewayModels();
	return <DocumentToolsRoom room="rerank" models={models} />;
}
import { Suspense } from "react";
