import type { Metadata } from "next";
import APIProviderDetailShell from "@/components/(data)/api-providers/APIProviderDetailShell";
import { capabilityToEndpoints } from "@/lib/config/capabilityToEndpoints";
import { getAPIProviderModelsListByAddedCached } from "@/lib/fetchers/api-providers/getAPIProvider";
import getAPIProviderHeader from "@/lib/fetchers/api-providers/getAPIProviderHeader";
import { buildMetadata } from "@/lib/seo";
import ProviderModelsClient from "./ProviderModelsClient";

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

function resolveAccessibleEndpoints(value?: string[] | null): string[] {
	const source = value ?? [];
	const expanded = source.flatMap((entry) => {
		const mapped = capabilityToEndpoints[entry];
		if (mapped?.length) return mapped;
		return [entry];
	});

	return Array.from(
		new Set(
			expanded
				.map((item) => String(item).trim())
				.filter(Boolean),
		),
	);
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
				"Browse all models available from this API provider on AI Stats, including date-added ordering, capability support, pricing visibility, and which variants are gateway accessible.",
			path,
			imagePath,
		});
	}

	const providerName = header.api_provider_name ?? "AI API provider";
	return buildMetadata({
		title: `${providerName} Models - Ordered by Date Added`,
		description: `View all ${providerName} models on AI Stats in date-added order, with gateway accessibility, supported capabilities, and quick visibility into pricing and integration coverage.`,
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

	const models = await getAPIProviderModelsListByAddedCached(apiProvider, false);

	const accessibleModels = models
		.map((model) => ({
			model,
			endpoints: resolveAccessibleEndpoints(model.endpoints),
		}))
		.filter(
			(entry) =>
				Boolean(entry.model.is_active_gateway) && entry.endpoints.length > 0,
		)
		.map((entry) => entry.model);

	return (
		<APIProviderDetailShell apiProviderId={apiProvider}>
			<ProviderModelsClient
				apiProvider={apiProvider}
				providerLabel={providerLabel}
				models={accessibleModels}
			/>
		</APIProviderDetailShell>
	);
}
