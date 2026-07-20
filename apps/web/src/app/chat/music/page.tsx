import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { AudioRoom } from "@/components/(chat)/rooms/AudioRoom";

export const metadata: Metadata = buildMetadata({
	title: "Music Room - Phaseo Chat",
	description: "Music generation workspace for audio models.",
	path: "/chat/music",
	keywords: ["AI music", "music generation", "Phaseo chat"],
});

export default function ChatMusicPage() {
	return <Suspense fallback={null}><ChatMusicContent /></Suspense>;
}

async function ChatMusicContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<AudioRoom
				models={models}
				roomId="music"
				initialMode="music"
				allowedModes={["music"]}
			/>
		</RoomScaffold>
	);
}
