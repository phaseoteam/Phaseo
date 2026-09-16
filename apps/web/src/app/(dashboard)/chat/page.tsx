import { Suspense } from "react";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { buildMetadata } from "@/lib/seo";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import { fetchChatEffectivePolicy } from "@/lib/fetchers/internal/fetchChatEffectivePolicy";
import { applyChatEffectivePolicy } from "@/lib/chat/effectivePolicy";
import { fetchServerProviderCatalogPreviews } from "@/lib/fetchers/internal/fetchServerProviderCatalogPreviews";
import { providerCatalogPreviewsToGatewayModels } from "@/lib/chat/providerCatalogPreviewModels";

export const metadata: Metadata = buildMetadata({
	title: "AI Chat",
	description:
		"Compare gateway models side by side with multimodal inputs, parameter controls, and local chat history.",
	path: "/chat",
	keywords: [
		"AI chat",
		"chat playground",
		"multimodal input",
		"model comparison",
	],
});

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
	const [catalogue, effectivePolicy, providerPreviews] = await Promise.all([
		fetchFrontendGatewayModels(),
		fetchChatEffectivePolicy().catch(() => null),
		fetchServerProviderCatalogPreviews(),
	]);
	const models = [
		...applyChatEffectivePolicy(catalogue, effectivePolicy),
		...providerCatalogPreviewsToGatewayModels(providerPreviews),
	];
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
		<ChatPlayground
			models={models}
			modelParam={modelParam ?? null}
			promptParam={promptParam ?? null}
		/>
	);
}
