import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import UnifiedPlayground from "@/components/(chat)/UnifiedPlayground";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import type { SearchParams } from "nuqs/server";

export const metadata: Metadata = buildMetadata({
	title: "Unified playground - AI Stats Chat",
	description:
		"Experimental local-browser playground for comparing multiple models across text, image, video, music, and audio endpoints.",
	path: "/chat/unified",
	keywords: [
		"AI playground",
		"model comparison",
		"multimodal",
		"video generation",
		"image generation",
	],
});

type UnifiedPlaygroundPageProps = {
	searchParams?: Promise<SearchParams>;
};

export default function UnifiedPlaygroundPage({
	searchParams,
}: UnifiedPlaygroundPageProps) {
	return (
		<Suspense fallback={<ChatPlaygroundShell />}>
			<UnifiedPlaygroundContent searchParams={searchParams} />
		</Suspense>
	);
}

async function UnifiedPlaygroundContent({
	searchParams,
}: UnifiedPlaygroundPageProps) {
	const models = await fetchFrontendGatewayModels();
	const resolvedParams = (await searchParams) ?? {};
	const modelParamRaw = resolvedParams.model;
	const promptParamRaw = resolvedParams.prompt;
	const modelParam = Array.isArray(modelParamRaw) ? modelParamRaw[0] : modelParamRaw;
	const promptParam = Array.isArray(promptParamRaw) ? promptParamRaw[0] : promptParamRaw;

	return (
		<UnifiedPlayground
			models={models}
			modelParam={modelParam ?? null}
			promptParam={promptParam ?? null}
		/>
	);
}
