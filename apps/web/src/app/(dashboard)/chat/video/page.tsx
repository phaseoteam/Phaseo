import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { VideoStudioRoom } from "@/components/(chat)/rooms/VideoStudioRoom";
import { videoApiFlag } from "@/lib/flags";

export const metadata: Metadata = buildMetadata({
	title: "Video Studio",
	description: "Prompt-first video generation workspace with async polling.",
	path: "/chat/video",
	keywords: ["AI video generation", "video studio", "Phaseo chat"],
});

export default function ChatVideoPage() {
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading video models…</p>}><VideoContent /></Suspense></RoomScaffold>;
}

async function VideoContent() {
	if (!await videoApiFlag()) notFound();
	const models = await fetchFrontendGatewayModels();

	return <VideoStudioRoom models={models} />;
}
