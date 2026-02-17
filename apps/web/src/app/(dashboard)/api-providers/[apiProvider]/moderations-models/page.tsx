// app/(providers)/[apiProvider]/moderations-models/page.tsx
import { FilePlus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
	const path = `/api-providers/${apiProvider}/moderations-models`;
	const imagePath = `/og/api-providers/${apiProvider}`;

	// Fallback if provider lookup fails
	if (!header) {
		return buildMetadata({
			title: "Moderations Models by AI API Providers",
			description:
				"Browse moderation and safety models from AI API providers on AI Stats. Compare capabilities for content filtering and safety use cases.",
			path,
			keywords: [
				"moderation models",
				"content filtering",
				"safety models",
				"AI Stats",
			],
			imagePath,
		});
	}

	const providerName = header.api_provider_name ?? "AI API provider";

	const description = [
		`${providerName} moderation models on AI Stats.`,
		"Explore safety and content filtering models, supported categories, and guidance for production use.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${providerName} Moderation Models - Safety & Content Filtering`,
		description,
		path,
		keywords: [
			providerName,
			`${providerName} moderation`,
			`${providerName} safety models`,
			"moderation models",
			"content filtering",
			"safety models",
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
		"moderations",
		includeHidden
	)) as APIProviderModels[];
	const helperText =
		"Models can support multiple endpoints. We group them by model and list every supported API route.";

	return (
		<APIProviderDetailShell apiProviderId={apiProvider}>
			<ModelTypeHeader
				title="Moderation models"
				description="Safety and content filtering models for policy enforcement."
				helper={helperText}
				count={models.length}
				icon={ShieldCheck}
				accentClass="bg-rose-50 text-rose-700 border-rose-100"
				badgeClass="bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
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
								There are no moderation models for this
								provider.
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
