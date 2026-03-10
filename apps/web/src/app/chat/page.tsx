import { Suspense } from "react";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { buildMetadata } from "@/lib/seo";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import UnifiedPlayground from "@/components/(chat)/UnifiedPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export const metadata: Metadata = buildMetadata({
	title: "Chat playground - AI Stats Chat",
	description:
		"Use the AI Stats chat playground to compare models across text, image, video, music, and audio endpoints in one unified workspace.",
	path: "/chat",
	keywords: [
		"AI chat",
		"playground",
		"AI Stats",
		"gateway",
		"multimodal",
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
	const models = await fetchFrontendGatewayModels();
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
		<UnifiedPlayground
			models={models}
			modelParam={modelParam ?? null}
			promptParam={promptParam ?? null}
		/>
	);
}
