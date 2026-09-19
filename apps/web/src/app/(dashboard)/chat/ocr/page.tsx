import { buildMetadata } from "@/lib/seo";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { RoomScaffold } from "@/components/(chat)/RoomScaffold";
import { DocumentToolsRoom } from "@/components/(chat)/rooms/DocumentToolsRoom";

export const metadata = buildMetadata({ title: "OCR", description: "Extract text from images.", path: "/chat/ocr" });

export default function ChatOcrPage() {
	return <RoomScaffold><Suspense fallback={<p role="status" className="p-6 text-sm text-muted-foreground">Loading OCR models…</p>}><OcrContent /></Suspense></RoomScaffold>;
}

async function OcrContent() {
	const models = await fetchFrontendGatewayModels();
	return <DocumentToolsRoom room="ocr" models={models} />;
}
import { Suspense } from "react";
