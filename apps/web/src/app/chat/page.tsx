import { Suspense } from "react";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { buildMetadata } from "@/lib/seo";
import ChatPlaygroundShell from "@/components/(chat)/ChatPlaygroundShell";
import ChatPlayground from "@/components/(chat)/ChatPlayground";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";

export const metadata: Metadata = buildMetadata({
	title: "Text Chat - AI Stats Chat",
	description:
		"Text room for model comparison with multimodal inputs and text responses.",
	path: "/chat",
	keywords: [
		"AI chat",
		"text room",
		"AI Stats",
		"gateway",
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
		<ChatPlayground
			models={models}
			modelParam={modelParam ?? null}
			promptParam={promptParam ?? null}
		/>
	);
}
