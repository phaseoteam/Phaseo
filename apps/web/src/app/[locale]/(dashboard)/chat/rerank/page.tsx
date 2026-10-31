import { getTranslations } from "next-intl/server";
import { useTranslations } from "next-intl";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DocumentToolsRoom } from "@/components/(chat)/rooms/DocumentToolsRoom";

export async function generateMetadata() {
	const t = await getTranslations("Product.chat.newRooms");
	const roomsT = await getTranslations("Common.ui.chatRooms");
	return buildMetadata({ title: roomsT("rerank"), description: t("rerankDescription"), path: "/chat/rerank" });
}

export default function ChatRerankPage() {
	const t = useTranslations("Product.chat.newRooms");
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">{t("rerankLoading")}</p>}><RerankContent /></Suspense></RoomScaffold>;
}

function RerankContent() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return <DocumentToolsRoom room="rerank" models={models} />;
}
import { Suspense } from "react";
