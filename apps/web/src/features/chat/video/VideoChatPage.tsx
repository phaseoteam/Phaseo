import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useLocale, useTranslations } from "@/i18n/react";
import { Suspense } from "react";
import { notFound } from "@/lib/navigation";
import { buildMetadata } from "@/lib/seo";
import { useSuspenseQuery } from "@tanstack/react-query";
import { chatGatewayModelsQuery } from "@/features/chat/chat.queries";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { VideoStudioRoom } from "@/components/(chat)/rooms/VideoStudioRoom";
import { shellDataQuery } from "@/components/header/shellData";

export async function getVideoChatMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("video"), description: t("videoDescription"), path: "/chat/video", keywords: ["AI video generation", "video studio", "Phaseo chat"] });
}

export default function ChatVideoPage() {
	const t = useTranslations("Product.chat");
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">{t("loadingVideoModels")}</p>}><VideoContent /></Suspense></RoomScaffold>;
}

function VideoContent() {
	// The video flag is resolved server-side with the site-shell data.
	const locale = useLocale();
	const { data: shellData } = useSuspenseQuery(shellDataQuery(locale));
	if (!shellData.capabilities.video) notFound();
	const { data: models } = useSuspenseQuery(chatGatewayModelsQuery());

	return <VideoStudioRoom models={models} />;
}
