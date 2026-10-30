import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DecisionsRoom } from "@/components/(chat)/rooms/DecisionsRoom";

export async function generateMetadata() {
	const t = await getTranslations("Product.chat.newRooms");
	const roomsT = await getTranslations("Common.ui.chatRooms");
	return buildMetadata({ title: roomsT("decisions"), description: t("decisionsDescription"), path: "/chat/decisions" });
}

export default function ChatDecisionsPage() {
	return (
		<Suspense fallback={null}>
			<ChatDecisionsContent />
		</Suspense>
	);
}

async function ChatDecisionsContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<DecisionsRoom models={models} />
		</RoomScaffold>
	);
}
