import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelPlayground from "@/components/(data)/model/playground/ModelPlayground";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import { getModelGatewayMetadataCached } from "@/lib/fetchers/models/getModelGatewayMetadata";
import { fetchFrontendGatewayModels } from "@/lib/fetchers/frontend/fetchFrontendGatewayModels";
import type { GatewaySupportedModel } from "@/lib/fetchers/gateway/getGatewaySupportedModelIds";
import { buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		return await getModelOverviewCached(modelId, includeHidden);
	} catch (error) {
		console.warn("[seo] failed to load model overview for playground metadata", {
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
	const includeHidden = false;
	const { canonicalModelId: modelId } = await resolveModelRouteIds(
		params,
		includeHidden,
	);
	const model = await fetchModel(modelId, includeHidden);
	const path = getModelPath(modelId, "playground");
	const imagePath = `/og/models/${modelId}`;

	if (!model) {
		return buildMetadata({
			title: "Model Playground",
			description:
				"Run multimodal playground tests for this model on AI Stats, including text, image, video, audio, embeddings, and moderation workflows.",
			path,
			keywords: [
				"AI model playground",
				"single prompt test",
				"AI billing",
				"AI Stats",
			],
			imagePath,
		});
	}

	const organisationName = model.organisation?.name ?? "AI provider";
	const description = [
		`Test ${model.name} from ${organisationName} in the AI Stats playground.`,
		"Run multimodal workflows, inspect usage and billing, and iterate without leaving the model page.",
	]
		.filter(Boolean)
		.join(" ");

	return buildMetadata({
		title: `${model.name} Playground - Single Prompt Test`,
		description,
		path,
		keywords: [
			model.name,
			`${model.name} playground`,
			`${model.name} quick test`,
			`${organisationName} AI`,
			"AI model playground",
			"AI Stats chat",
		],
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
	const model = await fetchModel(modelId, includeHidden);
	let requestModelId = modelId;
	const scopedModelIdentifiers = new Set<string>([modelId]);
	try {
		const gatewayMetadata = await getModelGatewayMetadataCached(
			modelId,
			includeHidden,
		);
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
				modelName={model?.name ?? modelId}
				gatewayModels={playgroundModels}
			/>
		</ModelDetailShell>
	);
}
