import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { ModerationRoom } from "@/components/(chat)/rooms/ModerationRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("moderation"), description: t("moderationDescription"), path: "/chat/moderation", keywords: ["AI moderation", "content safety", "moderation API"] });
}

export default function ChatModerationPage() {
	return <Suspense fallback={null}><ChatModerationContent /></Suspense>;
}

function ChatModerationContent() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return (
		<RoomScaffold>
			<ModerationRoom models={models} />
		</RoomScaffold>
	);
}
