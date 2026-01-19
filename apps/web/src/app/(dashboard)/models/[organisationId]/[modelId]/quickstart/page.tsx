// src/app/(dashboard)/models/[modelId]/(data)/model/gateway/page.tsx
import { buildMetadata } from "@/lib/seo";
import ModelGateway from "@/components/(data)/model/quickstart/ModelGateway";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import getModelGatewayMetadata, {
	getModelGatewayMetadataCached,
} from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { Metadata } from "next";
import {
	getModelIdFromParams,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import type { ModelGatewayMetadata } from "@/lib/fetchers/models/getModelGatewayMetadata";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";

async function fetchModel(modelId: string) {
	try {
		const [metadata, header] = await Promise.all([
			getModelGatewayMetadata(modelId),
			getModelOverviewHeader(modelId),
		]);
		if (!metadata) return null;
		return { metadata, header };
	} catch (error) {
		console.warn("[seo] failed to load model gateway metadata", {
			modelId,
			error,
		});
		return null;
	}
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const modelId = getModelIdFromParams(params);
	const result = await fetchModel(modelId);
	const path = `/models/${modelId}/gateway`;
	const imagePath = `/og/models/${modelId}`;

	if (!result) {
		return buildMetadata({
			title: "Conduit Integration for Model",
			description:
				"Explore Conduit support, providers, and routing details for AI models on AI Stats.",
			path,
			keywords: [
				"AI conduit",
				"model routing",
				"AI providers",
				"AI Stats",
			],
			imagePath,
		});
	}

	const { metadata, header } = result;
	const displayName = header?.name ?? metadata.modelId;
	const organisationName =
		header?.organisation?.name ??
		(metadata as any)?.providerName ??
		"AI provider";
	const description = `${displayName} Conduit support on AI Stats. View providers, streaming support, and routing options for this model.`;

	return buildMetadata({
		title: `${displayName} Conduit - Providers & Routing Options`,
		description,
		path,
		imagePath,
		keywords: [
			displayName,
			`${displayName} conduit`,
			`${organisationName} provider`,
			"AI conduit",
			"AI Stats",
		],
	});
}

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const modelId = getModelIdFromParams(routeParams);
	const metadata = (await getModelGatewayMetadataCached(
		modelId
	)) as ModelGatewayMetadata;

	return (
		<ModelDetailShell modelId={modelId} tab="quickstart">
			<ModelGateway metadata={metadata} />
		</ModelDetailShell>
	);
}
