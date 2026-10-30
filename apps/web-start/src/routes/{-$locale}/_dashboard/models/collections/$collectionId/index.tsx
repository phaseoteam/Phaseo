// Next: src/app/[locale]/(dashboard)/models/collections/[collectionId]/page.tsx (a redirect-only page).
import { createFileRoute } from "@tanstack/react-router";
import { redirectBeforeLoad } from "@/lib/start/redirectRoute";

const COLLECTION_PRESETS: Record<string, string> = {
	free: "/models?tiers=free",
	"image-generation": "/models?outputModalities=image",
	"video-generation": "/models?outputModalities=video",
	"audio-models": "/models?outputModalities=audio",
	tools: "/models?features=tools",
	reasoning: "/models?features=reasoning",
	"image-understanding": "/models?inputModalities=image",
};

export const Route = createFileRoute("/{-$locale}/_dashboard/models/collections/$collectionId/")({
	beforeLoad: redirectBeforeLoad("permanent", ({ params }) => COLLECTION_PRESETS[params.collectionId ?? ""] ?? "/models"),
});
