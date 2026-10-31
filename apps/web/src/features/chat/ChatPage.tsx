import { Suspense } from "react";
import { useSearch } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import type { StringSearch } from "@/lib/start/search";
import { buildMetadata } from "@/lib/seo";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import ChatPlaygroundCatalog from "@/components/(chat)/ChatPlaygroundCatalog";
import { providerCatalogPreviewsToGatewayModels } from "@/lib/chat/providerCatalogPreviewModels";
import { chatPlaygroundAccountDataQuery } from "./chat.functions";

export async function getChatMetadata(): Promise<PageMetadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("title"), description: t("description"), path: "/chat", keywords: ["AI chat", "chat playground", "multimodal input", "model comparison"] });
}

export default function ChatPage() {
	return (
		<Suspense fallback={<ChatPlaygroundShell />}>
			<ChatPlaygroundContent />
		</Suspense>
	);
}

function ChatPlaygroundContent() {
	const resolvedParams = useSearch({ from: "/{-$locale}/_dashboard/chat/" }) as StringSearch;
	// Opening a logged request compares its workspace with the one Chat bills.
	const opensLoggedRequest = Boolean(resolvedParams.fromRequest);
	const { data: { effectivePolicy, providerPreviews, internalModels, activeWorkspaceId } } = useSuspenseQuery(chatPlaygroundAccountDataQuery(opensLoggedRequest));
	const previewModels = providerCatalogPreviewsToGatewayModels(providerPreviews);
	const modelParamRaw = resolvedParams.model;
	const promptParamRaw = resolvedParams.prompt;
	const modelParam = Array.isArray(modelParamRaw)
		? modelParamRaw[0]
		: modelParamRaw;
	const promptParam = Array.isArray(promptParamRaw)
		? promptParamRaw[0]
		: promptParamRaw;

	return (
		<ChatPlaygroundCatalog
			previewModels={previewModels}
			internalModels={internalModels}
			effectivePolicy={effectivePolicy}
			modelParam={modelParam ?? null}
			promptParam={promptParam ?? null}
			activeWorkspaceId={activeWorkspaceId}
		/>
	);
}
