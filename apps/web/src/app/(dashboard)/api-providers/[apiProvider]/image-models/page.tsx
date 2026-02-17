// app/(providers)/[apiProvider]/image-models/page.tsx
import { FilePlus, Image as ImageIcon } from "lucide-react";
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
	const path = `/api-providers/${apiProvider}/image-models`;
	const imagePath = `/og/api-providers/${apiProvider}`;

	// Fallback if provider lookup fails
	if (!header) {
		return buildMetadata({
			title: "Image Models by AI API Providers",
			description:
				"Browse image generation models from AI API providers on AI Stats. Compare image generation, editing capabilities, and pricing across providers.",
			path,
			keywords: [
				"image generation models",
				"image editing models",
				"LLM API",
				"AI API providers",
				"AI Stats",
			],
			imagePath,
		});
	}

	const providerName = header.api_provider_name ?? "AI API provider";

	const description = [
		`${providerName} image models on AI Stats.`,
		"Explore image generation and editing capabilities, resolution limits, and pricing for this provider's image stack.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${providerName} Image Models - Generation & Editing APIs`,
		description,
		path,
		keywords: [
			providerName,
			`${providerName} image models`,
			`${providerName} image generation`,
			"image generation",
			"image editing",
			"AI image models",
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
		"image",
		includeHidden
	)) as APIProviderModels[];
	const helperText =
		"Models can support multiple endpoints. We group them by model and list every supported API route.";

	return (
		<APIProviderDetailShell apiProviderId={apiProvider}>
			<ModelTypeHeader
				title="Image models"
				description="Image generation and editing models for creative and production workflows."
				helper={helperText}
				count={models.length}
				icon={ImageIcon}
				accentClass="bg-violet-50 text-violet-600 border-violet-100"
				badgeClass="bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200"
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
								There are no image models for this provider.
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<div className="flex gap-2">
								<Button asChild>
									<a href="/contribute">Contribute</a>
								</Button>
								<Button variant="outline" asChild>
									<a href="https://docs.ai-stats.phaseo.app">Learn more</a>
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
