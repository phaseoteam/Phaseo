import { createFileRoute } from "@tanstack/react-router";
import { metadataToHead } from "@/lib/start/metadataToHead";
import OpenUiPage, { getOpenUiMetadata } from "@/features/experiments/openui/OpenUiPage";

export const Route = createFileRoute("/{-$locale}/experiments/openui/")({
	head: () => metadataToHead(getOpenUiMetadata()),
	component: OpenUiPage,
});
