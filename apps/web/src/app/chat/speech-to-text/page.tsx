import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Speech to Text Room - AI Stats Chat",
	description: "Speech transcription workspace for audio inputs.",
	path: "/chat/speech-to-text",
	keywords: ["AI transcription", "speech to text", "AI Stats chat"],
});

export default async function ChatSpeechToTextPage() {
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
