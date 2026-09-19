import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DocumentToolsRoom } from "@/components/(chat)/rooms/DocumentToolsRoom";

export const metadata = buildMetadata({ title: "OCR", description: "Extract text from images.", path: "/chat/ocr" });

export default async function ChatOcrPage() {
	const models = await fetchFrontendGatewayModels();
	return <RoomScaffold><DocumentToolsRoom room="ocr" models={models} /></RoomScaffold>;
}
