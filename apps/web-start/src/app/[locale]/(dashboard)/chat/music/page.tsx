import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("music"), description: t("musicDescription"), path: "/chat/music", keywords: ["AI music", "music generation", "Phaseo chat"] });
}

export default function ChatMusicPage() {
	return <Suspense fallback={null}><ChatMusicContent /></Suspense>;
}

async function ChatMusicContent() {
	let models: Awaited<ReturnType<typeof fetchFrontendGatewayModels>> = [];
	let modelsLoadFailed = false;
	try {
		models = await fetchFrontendGatewayModels();
	} catch {
		modelsLoadFailed = true;
	}
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				modelsLoadFailed={modelsLoadFailed}
				roomId="music"
				initialMode="music"
				allowedModes={["music"]}
			/>
		</RoomScaffold>
	);
}
