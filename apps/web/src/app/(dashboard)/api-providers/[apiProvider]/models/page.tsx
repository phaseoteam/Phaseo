import type { Metadata } from "next";
import APIProviderDetailShell from "@/components/(data)/api-providers/APIProviderDetailShell";
import {
	fetchFrontendAPIProviderHeader,
	fetchFrontendAPIProviderModels,
} from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { buildMetadata } from "@/lib/seo";
import ProviderModelsClient from "./ProviderModelsClient";

async function fetchProviderMeta(apiProviderId: string) {
	try {
		return await fetchFrontendAPIProviderHeader(apiProviderId);
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
	const path = `/api-providers/${apiProvider}/models`;
	const imagePath = `/og/api-providers/${apiProvider}`;

	if (!header) {
		return buildMetadata({
			title: "API Provider Models",
			description:
				"Browse all models available from this API provider on AI Stats, ordered by model release date with announcement-date fallback, plus capability support, pricing visibility, and gateway accessibility.",
			path,
			imagePath,
		});
	}

	const providerName = header.api_provider_name ?? "AI API provider";
	return buildMetadata({
		title: `${providerName} Models - Ordered by Model Date`,
		description: `View all ${providerName} models on AI Stats ordered by release date, with announcement date fallback, gateway accessibility, supported capabilities, and quick visibility into pricing and integration coverage.`,
		path,
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<{ apiProvider: string }>;
}) {
	const { apiProvider } = await params;
	const header = await fetchProviderMeta(apiProvider);
	const providerLabel = header?.api_provider_name ?? apiProvider;

	const models = await fetchFrontendAPIProviderModels(apiProvider);

	return (
		<APIProviderDetailShell apiProviderId={apiProvider}>
			<ProviderModelsClient
				apiProvider={apiProvider}
				providerLabel={providerLabel}
				models={models}
			/>
		</APIProviderDetailShell>
	);
}
