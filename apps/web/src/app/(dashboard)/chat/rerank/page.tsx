import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DocumentToolsRoom } from "@/components/(chat)/rooms/DocumentToolsRoom";

export const metadata = buildMetadata({ title: "Rerank", description: "Rank documents by relevance to a query.", path: "/chat/rerank" });

export default function ChatRerankPage() {
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading rerank models…</p>}><RerankContent /></Suspense></RoomScaffold>;
}

async function RerankContent() {
	const models = await fetchFrontendGatewayModels();
	return <DocumentToolsRoom room="rerank" models={models} />;
}
import { Suspense } from "react";
