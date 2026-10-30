import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("speech"), description: t("speechDescription"), path: "/chat/speech", keywords: ["AI speech", "text to speech", "Phaseo chat"] });
}

export default function ChatSpeechPage() {
	return <Suspense fallback={null}><ChatSpeechContent /></Suspense>;
}

async function ChatSpeechContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				roomId="speech"
				initialMode="speech"
				allowedModes={["speech"]}
			/>
		</RoomScaffold>
	);
}
