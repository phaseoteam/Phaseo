import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { ModerationRoom } from "@/components/(chat)/rooms/ModerationRoom";

export const metadata: Metadata = buildMetadata({
	title: "Moderation",
	description: "Evaluate text and images with structured moderation reports.",
	path: "/chat/moderation",
	keywords: ["AI moderation", "content safety", "moderation API"],
});

export default async function ChatModerationPage() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<ModerationRoom models={models} />
		</RoomScaffold>
	);
}
