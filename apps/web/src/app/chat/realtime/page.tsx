import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { RealtimeRoom } from "@/components/(chat)/rooms/RealtimeRoom";

export const metadata: Metadata = buildMetadata({
	title: "Realtime Room - Phaseo Chat",
	description: "Realtime voice and multimodal conversation workspace.",
	path: "/chat/realtime",
	keywords: ["AI realtime", "voice chat", "Phaseo chat"],
});

export default function ChatRealtimePage() {
	return (
		<RoomScaffold>
			<RealtimeRoom />
		</RoomScaffold>
	);
}
