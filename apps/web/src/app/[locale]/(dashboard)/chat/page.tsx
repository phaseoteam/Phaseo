import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { SearchParams } from "nuqs/server";
import { buildMetadata } from "@/lib/seo";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import ChatPlaygroundCatalog from "@/components/(chat)/ChatPlaygroundCatalog";
import { fetchChatEffectivePolicy } from "@/lib/fetchers/internal/fetchChatEffectivePolicy";
import { fetchServerProviderCatalogPreviews } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
import { providerCatalogPreviewsToGatewayModels } from "@/lib/chat/providerCatalogPreviewModels";
import { fetchServerAdminChatModels } from "@/lib/fetchers/internal/fetchServerAdminChatModels";

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

async function ChatPlaygroundContent({ searchParams }: ChatPageProps) {
	const [effectivePolicy, providerPreviews, internalModels] = await Promise.all([
		fetchChatEffectivePolicy().catch(() => null),
		fetchServerProviderCatalogPreviews(),
		fetchServerAdminChatModels(),
	]);
	const previewModels = providerCatalogPreviewsToGatewayModels(providerPreviews);
	const resolvedParams = (await searchParams) ?? {};
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
		/>
	);
}
