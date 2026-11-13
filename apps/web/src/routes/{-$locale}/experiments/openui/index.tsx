import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import OpenUiPage from "@/features/experiments/openui/OpenUiPage";
import { getOpenUiMetadata } from "@/features/experiments/openui/openUiMetadata";

export const Route = createFileRoute("/{-$locale}/experiments/openui/")({
	head: () => metadataToHead(getOpenUiMetadata()),
	component: OpenUiPage,
});
