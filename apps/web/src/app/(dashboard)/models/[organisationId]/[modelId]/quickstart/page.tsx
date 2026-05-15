// src/app/(dashboard)/models/[modelId]/(data)/model/gateway/page.tsx
import { buildMetadata } from "@/lib/seo";
import { ModelQuickstartSection } from "@/components/(data)/model/overview/ModelOverviewSections";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { buildModelPageMetadataDescription } from "@/lib/models/modelDescription";
import { permanentRedirect } from "next/navigation";
import {
	resolveQuickstartRequestContext,
	type QuickstartSearchParams,
} from "@/components/(data)/model/quickstart/requestContext";

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName, modelDescription } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId, "quickstart");
	const imagePath = `/og/models/${modelId}`;

	const description = buildModelPageMetadataDescription({
		modelDescription,
		suffix:
			"View providers, streaming support, request examples, and routing options for this model on AI Stats.",
		fallback: `${modelName} Gateway support on AI Stats. View providers, streaming support, and routing options for this model.`,
	});

	return buildMetadata({
		title: `${modelName} Gateway - Providers & Routing Options`,
		description,
		path,
		imagePath,
		keywords: [
			modelName,
			`${modelName} gateway`,
			organisationName ? `${organisationName} AI` : null,
			"AI gateway",
			"AI Stats",
		].filter(Boolean) as string[],
	});
}

export default async function Page({
	params,
	searchParams,
}: {
	params: Promise<ModelRouteParams>;
	searchParams: Promise<QuickstartSearchParams>;
}) {
	const [routeParams, routeSearchParams] = await Promise.all([
		params,
		searchParams,
	]);
	const includeHidden = false;
	const quickstartRequestContext =
		resolveQuickstartRequestContext(routeSearchParams);
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
			<ModelQuickstartSection
				modelId={modelId}
				includeHidden={includeHidden}
				quickstartRequestContext={quickstartRequestContext}
			/>
		</ModelDetailShell>
	);
}
