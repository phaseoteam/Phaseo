import { Braces, FilePlus } from "lucide-react";
import { getAPIProviderModelsCached } from "@/lib/fetchers/api-providers/getAPIProvider";
import type { APIProviderModels } from "@/lib/fetchers/api-providers/getAPIProvider";
import APIModelCard from "@/components/(data)/api-providers/Provider/APIModelCard";
import ModelTypeHeader from "@/components/(data)/api-providers/Provider/ModelTypeHeader";
import {
	Empty,
	EmptyHeader,
	EmptyTitle,
	EmptyDescription,
	EmptyMedia,
	EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import APIProviderDetailShell from "@/components/(data)/api-providers/APIProviderDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import getAPIProviderHeader from "@/lib/fetchers/api-providers/getAPIProviderHeader";

async function fetchProviderMeta(apiProviderId: string) {
	try {
		return await getAPIProviderHeader(apiProviderId);
	} catch (error) {
		console.warn("[seo] failed to load api provider metadata", {
			apiProviderId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<{ apiProvider: string }>;
}): Promise<Metadata> {
	const { apiProvider } = await props.params;
	const header = await fetchProviderMeta(apiProvider);
	const path = `/api-providers/${apiProvider}/embeddings-models`;
	const imagePath = `/og/api-providers/${apiProvider}`;

	// Fallback if provider lookup fails
	if (!header) {
		return buildMetadata({
			title: "Embeddings Models by AI API Providers",
			description:
				"Browse embedding models from AI API providers on AI Stats. Compare embedding dimensions, usage, and pricing for search and semantic similarity.",
			path,
			keywords: [
				"audio generation models",
				"speech-to-text models",
				"text-to-speech models",
				"LLM API",
				"AI API providers",
				"AI Stats",
			],
			imagePath,
		});
	}

	const providerName = header.api_provider_name ?? "AI API provider";

	const description = [
		`${providerName} embedding models on AI Stats.`,
		"Explore embeddings for search and semantic similarity, including dimensions, domains, and pricing.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${providerName} Embedding Models - Vector Search & Similarity`,
		description,
		path,
		keywords: [
			providerName,
			`${providerName} embeddings`,
			`${providerName} embedding models`,
			"embedding models",
			"vector search",
			"semantic similarity",
			"AI Stats",
		],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const { apiProvider } = await params;
	const includeHidden = false;
	const models = (await getAPIProviderModelsCached(
		apiProvider,
		"embeddings",
		includeHidden
	)) as APIProviderModels[];
	const helperText =
		"Models can support multiple endpoints. We group them by model and list every supported API route.";

	return (
		<APIProviderDetailShell apiProviderId={apiProvider}>
			<ModelTypeHeader
				title="Embedding models"
				description="Vector and semantic similarity models for retrieval, clustering, and search."
				helper={helperText}
				count={models.length}
				icon={Braces}
				accentClass="bg-slate-50 text-slate-700 border-slate-100"
				badgeClass="bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200"
			/>

			<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
				{(!models || models.length === 0) && (
					<Empty className="col-span-full">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<FilePlus />
							</EmptyMedia>
							<EmptyTitle>No models found</EmptyTitle>
							<EmptyDescription>
								There are no embeddings models for this
								provider.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<div className="flex gap-2">
								<Button asChild>
									<a href="/contribute">Contribute</a>
								</Button>
								<Button variant="outline" asChild>
									<a href="/docs">Learn more</a>
								</Button>
							</div>
						</EmptyContent>
					</Empty>
				)}

				{models.map((model) => (
					<APIModelCard key={model.model_id} model={model} />
				))}
			</div>
		</APIProviderDetailShell>
	);
}
