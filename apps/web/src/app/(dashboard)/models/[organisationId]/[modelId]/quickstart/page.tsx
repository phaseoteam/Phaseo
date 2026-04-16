// src/app/(dashboard)/models/[modelId]/(data)/model/gateway/page.tsx
import { buildMetadata } from "@/lib/seo";
import { ModelQuickstartSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import {
	getModelGatewayMetadataCached,
} from "@/lib/fetchers/models/getModelGatewayMetadata";
import type { Metadata } from "next";
import {
	getModelPath,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import getModelOverviewHeader from "@/lib/fetchers/models/getModelOverviewHeader";
import { permanentRedirect } from "next/navigation";

async function fetchModel(modelId: string, includeHidden: boolean) {
	try {
		const [metadata, header] = await Promise.all([
			getModelGatewayMetadataCached(modelId, includeHidden),
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
	const includeHidden = false;
	const { canonicalModelId: modelId } = await resolveModelRouteIds(
		params,
		includeHidden,
	);
	const result = await fetchModel(modelId, includeHidden);
	const path = getModelPath(modelId, "quickstart");
	const imagePath = `/og/models/${modelId}`;

	if (!result) {
		return buildMetadata({
			title: "Gateway Integration for Model",
			description:
				"Explore gateway support for this AI model, including compatible providers, streaming behavior, request formats, and routing options available across AI Stats integrations.",
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
	const includeHidden = false;
	const { requestedModelId, canonicalModelId } = await resolveModelRouteIds(
		routeParams,
		includeHidden,
	);
	if (canonicalModelId !== requestedModelId) {
		permanentRedirect(getModelPath(canonicalModelId, "quickstart"));
	}
	const modelId = canonicalModelId;

	return (
		<ModelDetailShell modelId={modelId} tab="quickstart" includeHidden={includeHidden}>
			<ModelQuickstartSection modelId={modelId} includeHidden={includeHidden} />
		</ModelDetailShell>
	);
}
