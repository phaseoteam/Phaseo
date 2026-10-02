import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { VideoStudioRoom } from "@/components/(chat)/rooms/VideoStudioRoom";
import { videoApiFlag } from "@/lib/flags";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("video"), description: t("videoDescription"), path: "/chat/video", keywords: ["AI video generation", "video studio", "Phaseo chat"] });
}

export default async function ChatVideoPage() {
	const t = await getTranslations("Product.chat");
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">{t("loadingVideoModels")}</p>}><VideoContent /></Suspense></RoomScaffold>;
}

async function VideoContent() {
	if (!await videoApiFlag()) notFound();
	const models = await fetchFrontendGatewayModels();

	return <VideoStudioRoom models={models} />;
}
