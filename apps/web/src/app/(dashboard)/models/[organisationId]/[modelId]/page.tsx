import { getModelOverviewCached } from "@/lib/fetchers/models/getModel";
import ModelOverviewSections, {
	ModelCreatorModelsSection,
	ModelCreatorModelsSkeleton,
	ModelOverviewSectionsSkeleton,
} from "@/components/(data)/model/overview/ModelOverviewSections";
import ModelDetailShell from "@/components/(data)/model/ModelDetailShell";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import {
	getModelPath,
	getModelMetadataIdentity,
	resolveModelRouteIds,
	type ModelRouteParams,
} from "@/components/(data)/model/model-route-helpers";
import { buildModelPageMetadataDescription } from "@/lib/models/modelDescription";
import { permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { isFreeRouterModelId } from "@/lib/models/freeRouter";
import FreeRouterOverview from "@/components/(data)/model/free-router/FreeRouterOverview";
import {
	resolveQuickstartRequestContext,
	type QuickstartRequestContext,
	type QuickstartSearchParams,
} from "@/components/(data)/model/quickstart/requestContext";

async function ModelOverviewSectionsContent({
	modelId,
	includeHidden,
	modelPromise,
	quickstartRequestContext,
}: {
	modelId: string;
	includeHidden: boolean;
	modelPromise: ReturnType<typeof getModelOverviewCached>;
	quickstartRequestContext?: QuickstartRequestContext;
}) {
	const model = await modelPromise;

	return (
		<ModelOverviewSections
			modelId={modelId}
			model={model}
			includeHidden={includeHidden}
			quickstartRequestContext={quickstartRequestContext}
		/>
	);
}

async function ModelCreatorModelsSectionContent({
	modelId,
	includeHidden,
	modelPromise,
}: {
	modelId: string;
	includeHidden: boolean;
	modelPromise: ReturnType<typeof getModelOverviewCached>;
}) {
	const model = await modelPromise;
	if (!model) return null;

	return (
		<div className="mt-10">
			<ModelCreatorModelsSection
				modelId={modelId}
				includeHidden={includeHidden}
				model={model}
			/>
		</div>
	);
}

export async function generateMetadata(props: {
	params: Promise<ModelRouteParams>;
}): Promise<Metadata> {
	const params = await props.params;
	const { modelId, modelName, organisationName, modelDescription } = await getModelMetadataIdentity(
		params,
		false,
	);
	const path = getModelPath(modelId);
	const imagePath = `/og/models/${modelId}`;

	return buildMetadata({
		title: `${modelName} - Benchmarks, Pricing & API Access`,
		description: buildModelPageMetadataDescription({
			modelDescription,
			suffix:
				"Browse benchmarks, providers, pricing, deployment options, and compatibility details on AI Stats.",
			fallback: `Browse benchmarks, providers, pricing, deployment options, and compatibility details for ${modelName} on AI Stats.`,
		}),
		path,
		keywords: [
			modelName,
			`${modelName} benchmarks`,
			`${modelName} pricing`,
			organisationName ? `${organisationName} AI` : null,
			"AI Stats",
			"AI model comparison",
		].filter(Boolean) as string[],
		imagePath,
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
		permanentRedirect(getModelPath(canonicalModelId));
	}
	const modelId = canonicalModelId;
	if (isFreeRouterModelId(modelId)) {
		return (
			<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden}>
				<FreeRouterOverview />
			</ModelDetailShell>
		);
	}
	const modelPromise = getModelOverviewCached(modelId, includeHidden);

	return (
		<ModelDetailShell modelId={modelId} tab="overview" includeHidden={includeHidden}>
			<Suspense fallback={<ModelOverviewSectionsSkeleton />}>
				<ModelOverviewSectionsContent
					modelId={modelId}
					includeHidden={includeHidden}
					modelPromise={modelPromise}
					quickstartRequestContext={quickstartRequestContext}
				/>
			</Suspense>
			<Suspense fallback={<ModelCreatorModelsSkeleton />}>
				<ModelCreatorModelsSectionContent
					modelId={modelId}
					includeHidden={includeHidden}
					modelPromise={modelPromise}
				/>
			</Suspense>
		</ModelDetailShell>
	);
}
