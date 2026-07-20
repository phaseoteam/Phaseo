import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Speech to Text Room - Phaseo Chat",
	description: "Speech transcription workspace for audio inputs.",
	path: "/chat/speech-to-text",
	keywords: ["AI transcription", "speech to text", "Phaseo chat"],
});

export default function ChatSpeechToTextPage() {
	return <Suspense fallback={null}><ChatSpeechToTextContent /></Suspense>;
}

async function ChatSpeechToTextContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				roomId="speech-to-text"
				initialMode="transcription"
				allowedModes={["transcription"]}
			/>
		</RoomScaffold>
	);
}
