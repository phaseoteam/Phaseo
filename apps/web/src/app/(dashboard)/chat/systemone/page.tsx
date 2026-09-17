import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { SystemOneRoom } from "@/components/(chat)/rooms/SystemOneRoom";

export const metadata: Metadata = buildMetadata({
	title: "Decisions",
	description: "Generate typed decisions from structured state with TypeSafe Jev.",
	path: "/chat/systemone",
	keywords: ["Decisions", "System One", "TypeSafe", "Jev"],
});

export default function ChatSystemOnePage() {
	return <Suspense fallback={null}><ChatSystemOneContent /></Suspense>;
}

async function ChatSystemOneContent() {
	const models = await fetchFrontendGatewayModels();
	return (
		<RoomScaffold>
			<SystemOneRoom models={models} />
		</RoomScaffold>
	);
}
