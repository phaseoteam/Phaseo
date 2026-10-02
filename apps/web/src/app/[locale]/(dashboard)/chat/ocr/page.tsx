import { getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DocumentToolsRoom } from "@/components/(chat)/rooms/DocumentToolsRoom";

export async function generateMetadata() {
	const t = await getTranslations("Product.chat.newRooms");
	const roomsT = await getTranslations("Common.ui.chatRooms");
	return buildMetadata({ title: roomsT("ocr"), description: t("ocrDescription"), path: "/chat/ocr" });
}

export default async function ChatOcrPage() {
	const t = await getTranslations("Product.chat.newRooms");
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">{t("ocrLoading")}</p>}><OcrContent /></Suspense></RoomScaffold>;
}

async function OcrContent() {
	const models = await fetchFrontendGatewayModels();
	return <DocumentToolsRoom room="ocr" models={models} />;
}
import { Suspense } from "react";
