import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { ModerationRoom } from "@/components/(chat)/rooms/ModerationRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("moderation"), description: t("moderationDescription"), path: "/chat/moderation", keywords: ["AI moderation", "content safety", "moderation API"] });
}

export default function ChatModerationPage() {
	return <Suspense fallback={null}><ChatModerationContent /></Suspense>;
}

async function ChatModerationContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<ModerationRoom models={models} />
		</RoomScaffold>
	);
}
