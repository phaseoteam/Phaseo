import { permanentRedirect } from "next/navigation";

const COLLECTION_PRESETS: Record<string, string> = {
	free: "/models?tiers=free",
	"image-generation": "/models?outputModalities=image",
	"video-generation": "/models?outputModalities=video",
	"audio-models": "/models?outputModalities=audio",
	tools: "/models?features=tools",
	reasoning: "/models?features=reasoning",
	"image-understanding": "/models?inputModalities=image",
};

export default async function CollectionPresetRedirectPage({
	params,
}: {
	params: Promise<{ collectionId: string }>;
}) {
	const { collectionId } = await params;
	permanentRedirect(COLLECTION_PRESETS[collectionId] ?? "/models");
}
