import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelPlayground from "@/components/(data)/model/playground/ModelPlayground";
import { getModelGatewayMetadataCached } from "@/lib/fetchers/models/getModelGatewayMetadata";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId, "playground");
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} Playground - Single Prompt Test`,
		description:
			`Run multimodal playground tests for ${modelName} on AI Stats, including text, image, video, audio, embeddings, and moderation workflows.`,
		path,
		keywords: [
			modelName,
			`${modelName} playground`,
			`${modelName} quick test`,
			organisationName ? `${organisationName} AI` : null,
			"AI model playground",
			"AI Stats chat",
		].filter(Boolean) as string[],
		imagePath,
	});
}

export default async function Page({
	params,
}: {
	params: Promise<ModelRouteParams>;
}) {
	const routeParams = await params;
	const includeHidden = false;
	const { requestedModelId, canonicalModelId } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	if (canonicalModelId !== requestedModelId) {
		permanentRedirect(getModelPath(canonicalModelId, "playground"));
	}
	const modelId = canonicalModelId;
	const modelDisplayName = await getModelOverviewHeader(
		modelId,
		includeHidden,
	)
		.then((header) => header.name?.trim() || modelId)
		.catch(() => modelId);
	let requestModelId = modelId;
	let primaryModelIdentifierByEndpoint: Record<string, string> = {};
	const scopedModelIdentifiers = new Set<string>([modelId]);
	try {
		const gatewayMetadata = await getModelGatewayMetadataCached(
			modelId,
			includeHidden,
		);
		primaryModelIdentifierByEndpoint =
			gatewayMetadata.primaryModelIdentifierByEndpoint;
		for (const identifier of Object.values(
			gatewayMetadata.primaryModelIdentifierByEndpoint,
		)) {
			const normalized = identifier?.trim();
			if (normalized) scopedModelIdentifiers.add(normalized);
		}
		const textPrimary =
			gatewayMetadata.primaryModelIdentifierByEndpoint["text.generate"] ??
			gatewayMetadata.primaryModelIdentifierByEndpoint["chat.generate"] ??
			null;
		requestModelId =
			(textPrimary?.trim() ||
				gatewayMetadata.primaryModelIdentifier?.trim() ||
				modelId);
		scopedModelIdentifiers.add(requestModelId);
	} catch (error) {
		console.warn("[playground] failed to resolve gateway model identifier", {
			modelId,
			error,
		});
	}
	let playgroundModels: GatewaySupportedModel[] = [];
	try {
		const allGatewayModels = await fetchFrontendGatewayModels();
		playgroundModels = allGatewayModels.filter((entry) =>
			scopedModelIdentifiers.has(entry.modelId) && entry.isAvailable,
		);
	} catch (error) {
		console.warn("[playground] failed to load scoped gateway model rows", {
			modelId,
			error,
		});
	}

	return (
		<ModelDetailShell
			modelId={modelId}
			tab="playground"
			includeHidden={includeHidden}
		>
			<ModelPlayground
				modelId={modelId}
				requestModelId={requestModelId}
				modelName={modelDisplayName}
				gatewayModels={playgroundModels}
				primaryModelIdentifierByEndpoint={primaryModelIdentifierByEndpoint}
			/>
		</ModelDetailShell>
	);
}
