import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DocumentToolsRoom } from "@/components/(chat)/rooms/DocumentToolsRoom";

export const metadata = buildMetadata({ title: "Rerank", description: "Rank documents by relevance to a query.", path: "/chat/rerank" });

export default async function ChatRerankPage() {
	const models = await fetchFrontendGatewayModels();
	return <RoomScaffold><DocumentToolsRoom room="rerank" models={models} /></RoomScaffold>;
}
