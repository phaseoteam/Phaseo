import { getTranslations } from "@/i18n/server";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
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

function ChatDecisionsContent() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return (
		<RoomScaffold>
			<DecisionsRoom models={models} />
		</RoomScaffold>
	);
}
