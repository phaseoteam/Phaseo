import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DecisionsRoom } from "@/components/(chat)/rooms/DecisionsRoom";

export const metadata: Metadata = buildMetadata({
	title: "Decisions",
	description: "Generate typed decisions from structured state with TypeSafe Jev.",
	path: "/chat/decisions",
	keywords: ["Decisions", "TypeSafe", "Jev"],
});

export default function ChatDecisionsPage() {
	return (
		<Suspense fallback={null}>
			<ChatDecisionsContent />
		</Suspense>
	);
}

async function ChatDecisionsContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<DecisionsRoom models={models} />
		</RoomScaffold>
	);
}
