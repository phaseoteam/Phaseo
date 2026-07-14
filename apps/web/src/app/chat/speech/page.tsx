import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Text to Speech Room - Phaseo Chat",
	description: "Text-to-speech workspace for generating spoken audio.",
	path: "/chat/speech",
	keywords: ["AI speech", "text to speech", "Phaseo chat"],
});

export default async function ChatSpeechPage() {
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
