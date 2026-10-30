import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/app/[locale]/(dashboard)/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { ImageStudioRoom } from "@/components/(chat)/rooms/ImageStudioRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("imageStudio"), description: t("imageStudioDescription"), path: "/chat/image", keywords: ["AI image generation", "image studio", "Phaseo chat"] });
}

export default function ChatImagePage() {
	return <Suspense fallback={null}><ChatImageContent /></Suspense>;
}

function ChatImageContent() {
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());
	return (
		<RoomScaffold>
			<ImageStudioRoom models={models} />
		</RoomScaffold>
	);
}
