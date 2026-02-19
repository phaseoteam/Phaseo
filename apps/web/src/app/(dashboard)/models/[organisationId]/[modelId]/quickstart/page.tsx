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

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		const [metadata, header] = await Promise.all([
			getModelGatewayMetadata(modelId, includeHidden),
			getModelOverviewHeader(modelId, includeHidden),
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
	const includeHidden = false;
	const result = await fetchModel(modelId, includeHidden);
	const path = `/models/${modelId}/gateway`;
	const imagePath = `/og/models/${modelId}`;

	if (!result) {
		return buildMetadata({
			title: "Gateway Integration for Model",
			description:
				"Explore Gateway support, providers, and routing details for AI models on AI Stats.",
			path,
			keywords: [
				"AI gateway",
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
	const description = `${displayName} Gateway support on AI Stats. View providers, streaming support, and routing options for this model.`;

	return buildMetadata({
		title: `${displayName} Gateway - Providers & Routing Options`,
		description,
		path,
		imagePath,
		keywords: [
			displayName,
			`${displayName} gateway`,
			`${organisationName} provider`,
			"AI gateway",
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
	const includeHidden = false;
	const model = await fetchModel(modelId, includeHidden);

	if (!model) {
		return (
			<ModelDetailShell
				modelId={modelId}
				tab="quickstart"
				includeHidden={includeHidden}
			>
				{null}
			</ModelDetailShell>
		);
	}

	let metadata: ModelGatewayMetadata;
	try {
		metadata = (await getModelGatewayMetadataCached(
			modelId,
			includeHidden
		)) as ModelGatewayMetadata;
	} catch (error) {
		console.warn("[quickstart] failed to load model gateway metadata", {
			modelId,
			error,
		});
		return (
			<ModelDetailShell
				modelId={modelId}
				tab="quickstart"
				includeHidden={includeHidden}
			>
				{null}
			</ModelDetailShell>
		);
	}

	return (
		<ModelDetailShell modelId={modelId} tab="quickstart" includeHidden={includeHidden}>
			<ModelGateway metadata={metadata} />
		</ModelDetailShell>
	);
}
