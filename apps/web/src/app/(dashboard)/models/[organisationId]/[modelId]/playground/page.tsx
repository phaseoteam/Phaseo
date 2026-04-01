import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import ModelPlayground from "@/components/(data)/model/playground/ModelPlayground";
import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import { getModelGatewayMetadataCached } from "@/lib/fetchers/models/getModelGatewayMetadata";
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
				"Run a quick single-message playground test for this model on AI Stats, including latency, token usage, and billed cost before moving into chat.",
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
		"Send one prompt, view latency and token cost, and continue in the chatroom.",
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
	try {
		const gatewayMetadata = await getModelGatewayMetadataCached(
			modelId,
			includeHidden,
		);
		const textPrimary =
			gatewayMetadata.primaryModelIdentifierByEndpoint["text.generate"] ??
			gatewayMetadata.primaryModelIdentifierByEndpoint["chat.generate"] ??
			null;
		requestModelId =
			(textPrimary?.trim() ||
				gatewayMetadata.primaryModelIdentifier?.trim() ||
				modelId);
	} catch (error) {
		console.warn("[playground] failed to resolve gateway model identifier", {
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
			/>
		</ModelDetailShell>
	);
}
