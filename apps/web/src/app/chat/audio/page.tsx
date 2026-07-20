import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Audio Studio",
	description:
		"Audio workspace for speech synthesis, transcription, and translation.",
	path: "/chat/audio",
	keywords: ["AI audio", "speech synthesis", "transcription", "translation"],
});

export default function ChatAudioPage() {
	return <Suspense fallback={null}><ChatAudioContent /></Suspense>;
}

async function ChatAudioContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<AudioRoom models={models} />
		</RoomScaffold>
	);
}
