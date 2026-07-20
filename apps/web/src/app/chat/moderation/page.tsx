import type { Metadata } from "next";
import { Suspense } from "react";
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

export default function ChatModerationPage() {
	return <Suspense fallback={null}><ChatModerationContent /></Suspense>;
}

async function ChatModerationContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<ModerationRoom models={models} />
		</RoomScaffold>
	);
}
