import { Suspense, use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import type { SearchParams } from "nuqs/server";
import { buildMetadata } from "@/lib/seo";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import ChatPlaygroundCatalog from "@/components/(chat)/ChatPlaygroundCatalog";
import { providerCatalogPreviewsToGatewayModels } from "@/lib/chat/providerCatalogPreviewModels";
import { chatPlaygroundAccountDataQuery } from "./chat.functions";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("Product.chat");
	return buildMetadata({ title: t("title"), description: t("description"), path: "/chat", keywords: ["AI chat", "chat playground", "multimodal input", "model comparison"] });
}

type ChatPageProps = {
	searchParams?: Promise<SearchParams>;
};

export default function ChatPlaygroundPage({ searchParams }: ChatPageProps) {
	return (
		<Suspense fallback={<ChatPlaygroundShell />}>
			<ChatPlaygroundContent searchParams={searchParams} />
		</Suspense>
	);
}

function ChatPlaygroundContent({ searchParams }: ChatPageProps) {
	const resolvedParams = (searchParams ? use(searchParams) : undefined) ?? {};
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
