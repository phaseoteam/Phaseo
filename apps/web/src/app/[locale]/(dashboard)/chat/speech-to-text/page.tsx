import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";
import { realtimeVoiceFlag } from "@/lib/flags";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("speechToText"), description: t("speechToTextDescription"), path: "/chat/speech-to-text", keywords: ["AI transcription", "speech to text", "Phaseo chat"] });
}

export default function ChatSpeechToTextPage() {
	return <Suspense fallback={null}><ChatSpeechToTextContent /></Suspense>;
}

async function ChatSpeechToTextContent() {
	// Live transcription runs on the realtime relay, behind the same gate as the Realtime room.
	const [models, liveTranscription] = await Promise.all([fetchFrontendGatewayModels(), realtimeVoiceFlag()]);
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				roomId="speech-to-text"
				initialMode="transcription"
				allowedModes={["transcription"]}
				liveTranscription={liveTranscription}
			/>
		</RoomScaffold>
	);
}
